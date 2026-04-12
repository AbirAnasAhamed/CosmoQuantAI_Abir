import apiClient from './client';

// রেজিস্ট্রেশন (পাথ আপডেট করা হয়েছে)
export const registerUser = async (userData: any) => {
  // আগে ছিল: '/register'
  // এখন হবে: '/v1/auth/register'
  const response = await apiClient.post('/auth/register', userData);
  return response.data;
};

// লগইন (পাথ আপডেট করা হয়েছে)
export const loginUser = async (credentials: any) => {
  const formData = new URLSearchParams();
  formData.append('username', credentials.email);
  formData.append('password', credentials.password);

  // আগে ছিল: '/login'
  // এখন হবে: '/v1/auth/login'
  const response = await apiClient.post('/auth/login', formData, {
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded'
    }
  });
  return response.data;
};

// বর্তমান ইউজার (পাথ আপডেট করা হয়েছে)
export const fetchCurrentUser = async () => {
  // আগে ছিল: '/users/me'
  // এখন হবে: '/v1/users/me'
  const response = await apiClient.get('/users/me');
  return response.data;
};

// পাসওয়ার্ড রিসেট ইমেইল (পাথ আপডেট করা হয়েছে)
export const sendForgotPasswordRequest = async (email: string) => {
  // আগে ছিল: '/forgot-password'
  // এখন হবে: '/v1/auth/forgot-password'
  const response = await apiClient.post('/auth/forgot-password', { email });
  return response.data;
};

// নতুন পাসওয়ার্ড সেট করা (পাথ আপডেট করা হয়েছে)
export const resetUserPassword = async (token: string, newPassword: string) => {
  // আগে ছিল: '/reset-password'
  // এখন হবে: '/v1/auth/reset-password'
  const response = await apiClient.post('/auth/reset-password', {
    token,
    new_password: newPassword
  });
  return response.data;
};
export const updateUserSecurity = async (data: { allowed_ips?: string[], is_ip_whitelist_enabled?: boolean }) => {
  const response = await apiClient.put('/users/me/security', data);
  return response.data;
};

export const uploadUserAvatar = async (file: File) => {
  const formData = new FormData();
  formData.append('file', file);

  const response = await apiClient.post('/users/me/avatar', formData, {
    headers: {
      'Content-Type': 'multipart/form-data'
    }
  });
  return response.data;
};
