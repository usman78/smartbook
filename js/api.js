const API_BASE_URL = 'http://localhost:5000/api';

const api = {
    // Auth & Utilities
    async login(email, password) {
        const res = await fetch(`${API_BASE_URL}/auth/login`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email, password })
        });
        const data = await res.json();
        if (data.success) {
            localStorage.setItem('adminToken', data.token);
            localStorage.setItem('adminUser', JSON.stringify(data.data));
        }
        return data;
    },

    getAuthHeaders() {
        const token = localStorage.getItem('adminToken');
        return {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token}`
        };
    },

    // Public API
    async getProviders(clinicSlug, appointmentTypeId = null) {
        let url = `${API_BASE_URL}/public/clinics/${clinicSlug}/providers`;
        if (appointmentTypeId) {
            url += `?appointmentTypeId=${appointmentTypeId}`;
        }
        const res = await fetch(url);
        return res.json();
    },

    async getAppointmentTypes(clinicSlug) {
        const res = await fetch(`${API_BASE_URL}/public/clinics/${clinicSlug}/appointment-types`);
        return res.json();
    },

    async getSlots(clinicSlug, providerId, date) {
        const res = await fetch(`${API_BASE_URL}/public/clinics/${clinicSlug}/providers/${providerId}/slots?date=${date}`);
        return res.json();
    },

    async reserveSlot(clinicSlug, providerId, appointmentTypeId, slotDatetime, isNewPatient = false) {
        const res = await fetch(`${API_BASE_URL}/public/slots/reserve`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ clinicSlug, providerId, appointmentTypeId, slotDatetime, isNewPatient })
        });
        return res.json();
    },

    async createBooking(sessionToken, patientData, paymentMethodId) {
        const res = await fetch(`${API_BASE_URL}/public/appointments`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ sessionToken, patientData, paymentMethodId })
        });
        return res.json();
    },

    // Admin API
    async getAdminProviders(clinicId) {
        const res = await fetch(`${API_BASE_URL}/admin/providers?clinicId=${clinicId}`, {
            headers: this.getAuthHeaders()
        });
        return res.json();
    },

    async updateProviderSchedule(providerId, schedules) {
        const res = await fetch(`${API_BASE_URL}/admin/providers/${providerId}/schedule`, {
            method: 'PUT',
            headers: this.getAuthHeaders(),
            body: JSON.stringify({ schedules })
        });
        return res.json();
    },

    async getInsuranceQueue(status = 'pending') {
        const res = await fetch(`${API_BASE_URL}/admin/insurance/queue?status=${status}`, {
            headers: this.getAuthHeaders()
        });
        return res.json();
    },

    async updateInsuranceStatus(data) {
        const res = await fetch(`${API_BASE_URL}/admin/insurance/verify`, {
            method: 'POST',
            headers: this.getAuthHeaders(),
            body: JSON.stringify(data)
        });
        return res.json();
    },

    async getDashboardStats() {
        const res = await fetch(`${API_BASE_URL}/admin/stats`, {
            headers: this.getAuthHeaders()
        });
        return res.json();
    },

    async getAppointmentsToday(clinicId) {
        const res = await fetch(`${API_BASE_URL}/admin/appointments/today?clinicId=${clinicId}`, {
            headers: this.getAuthHeaders()
        });
        return res.json();
    },

    async getWaitlist(clinicId) {
        const res = await fetch(`${API_BASE_URL}/admin/waitlist?clinicId=${clinicId}`, {
            headers: this.getAuthHeaders()
        });
        return res.json();
    },

    async notifyWaitlist(appointmentId) {
        const res = await fetch(`${API_BASE_URL}/admin/waitlist/notify-staggered`, {
            method: 'POST',
            headers: this.getAuthHeaders(),
            body: JSON.stringify({ appointmentId })
        });
        return res.json();
    },

    async mergePatients(keepId, mergeFromId) {
        const res = await fetch(`${API_BASE_URL}/admin/patients/merge`, {
            method: 'POST',
            headers: this.getAuthHeaders(),
            body: JSON.stringify({ keepId, mergeFromId })
        });
        return res.json();
    },

    async processNoShow(appointmentId) {
        const res = await fetch(`${API_BASE_URL}/admin/appointments/${appointmentId}/no-show`, {
            method: 'POST',
            headers: this.getAuthHeaders()
        });
        return res.json();
    },

    // Secure API
    async verifyDOB(token, dob) {
        const res = await fetch(`${API_BASE_URL}/secure/appointment/${token}/verify`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ dob })
        });
        return res.json();
    }
};

window.smartbookApi = api;
