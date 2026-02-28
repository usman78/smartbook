const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);

/**
 * PATH A: AUTH HOLD (≤ 7 days)
 * Places an authorization hold on the card.
 */
const createAuthHold = async (paymentMethodId, amount, appointmentId, patientEmail) => {
    try {
        const paymentIntent = await stripe.paymentIntents.create({
            amount: Math.round(amount * 100), // cents
            currency: 'usd',
            payment_method: paymentMethodId,
            confirm: true,
            automatic_payment_methods: {
                enabled: true,
                allow_redirects: 'never'
            },
            capture_method: 'manual', // Auth hold — NOT captured yet
            description: `Deposit hold for appointment ${appointmentId}`,
            receipt_email: patientEmail,
            metadata: {
                appointment_id: appointmentId,
                type: 'cosmetic_deposit'
            }
        });

        return {
            success: true,
            paymentStrategy: 'auth_hold',
            paymentIntentId: paymentIntent.id,
            status: 'authorized',
            amount: amount
        };
    } catch (error) {
        return {
            success: false,
            error: error.message,
            stripeError: error.raw?.message
        };
    }
};

/**
 * PATH B: SETUP INTENT (> 7 days)
 * Saves the card for later use without holding funds yet.
 */
const savePaymentMethodForLater = async (paymentMethodId, amount, appointmentId, patientEmail) => {
    try {
        // Note: In a real implementation, you'd check for an existing customer or create one
        const customer = await stripe.customers.create({
            email: patientEmail,
            payment_method: paymentMethodId,
            invoice_settings: {
                default_payment_method: paymentMethodId
            }
        });

        const setupIntent = await stripe.setupIntents.create({
            customer: customer.id,
            payment_method: paymentMethodId,
            confirm: true,
            automatic_payment_methods: {
                enabled: true,
                allow_redirects: 'never'
            },
            usage: 'off_session', // Essential for charging later without patient present
            metadata: {
                appointment_id: appointmentId,
                type: 'cosmetic_deposit'
            }
        });

        return {
            success: true,
            paymentStrategy: 'delayed_capture',
            setupIntentId: setupIntent.id,
            customerId: customer.id,
            paymentMethodId: paymentMethodId,
            status: 'pending_setup',
            amount: amount
        };
    } catch (error) {
        return {
            success: false,
            error: error.message,
            stripeError: error.raw?.message
        };
    }
};

/**
 * CAPTURES an authorized hold (e.g., on completion or no-show).
 */
const captureHold = async (paymentIntentId) => {
    try {
        const intent = await stripe.paymentIntents.capture(paymentIntentId);
        return { success: true, intent };
    } catch (error) {
        return { success: false, error: error.message };
    }
};

/**
 * VOIDS an authorized hold (e.g., on timely cancellation).
 */
const voidHold = async (paymentIntentId) => {
    try {
        const intent = await stripe.paymentIntents.cancel(paymentIntentId);
        return { success: true, intent };
    } catch (error) {
        return { success: false, error: error.message };
    }
};

/**
 * Creates an auth hold using a previously saved card (off-session).
 * Used for T-7 day transitions.
 */
const createHoldFromSavedCard = async (customerId, paymentMethodId, amount, appointmentId) => {
    try {
        const paymentIntent = await stripe.paymentIntents.create({
            amount: Math.round(amount * 100),
            currency: 'usd',
            customer: customerId,
            payment_method: paymentMethodId,
            off_session: true, // Crucial for background jobs
            confirm: true,
            capture_method: 'manual',
            metadata: {
                appointment_id: appointmentId,
                type: 'delayed_auth_hold'
            }
        });

        return {
            success: true,
            paymentIntentId: paymentIntent.id,
            status: 'authorized'
        };
    } catch (error) {
        return {
            success: false,
            error: error.message,
            stripeError: error.raw?.message
        };
    }
};

/**
 * Cancels an auth hold (voids the transaction).
 */
const cancelAuthHold = async (paymentIntentId) => {
    try {
        const intent = await stripe.paymentIntents.cancel(paymentIntentId);
        return { success: true, intent };
    } catch (error) {
        return { success: false, error: error.message };
    }
};

/**
 * Cancels a setup intent (removes saved card if only for this appt).
 */
const cancelSetupIntent = async (setupIntentId) => {
    try {
        const intent = await stripe.setupIntents.cancel(setupIntentId);
        return { success: true, intent };
    } catch (error) {
        return { success: false, error: error.message };
    }
};

module.exports = {
    createAuthHold,
    savePaymentMethodForLater,
    captureHold,
    voidHold,
    createHoldFromSavedCard,
    cancelAuthHold,
    cancelSetupIntent
};
