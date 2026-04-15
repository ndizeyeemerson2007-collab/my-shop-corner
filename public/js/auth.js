const LOCAL_AUTH_TOKEN = 'shopcorner_token';
const LOCAL_USER_INFO = 'shopcorner_user';
const authForm = document.getElementById('auth-form');
const toggleBtn = document.getElementById('toggle-mode');
const toggleDesc = document.getElementById('toggle-desc');
const signupPanel = document.getElementById('signup-panel');
const loginPanel = document.getElementById('login-panel');
const signupFields = document.getElementById('signup-fields');
const formModeInput = document.getElementById('form-mode');
const submitBtn = document.getElementById('submit-btn');
let isSignup = false;

if (toggleBtn) {
  toggleBtn.addEventListener('click', () => {
    isSignup = !isSignup;
    signupFields.style.display = isSignup ? 'flex' : 'none';
    loginPanel.style.display = isSignup ? 'none' : 'block';
    signupPanel.style.display = isSignup ? 'block' : 'none';
    formModeInput.value = isSignup ? 'signup' : 'login';
    submitBtn.textContent = isSignup ? 'Create Account' : 'Sign In';
    toggleDesc.textContent = isSignup ? 'Already have an account?' : "Don't have an account?";
    toggleBtn.textContent = isSignup ? 'Sign In' : 'Create Account';
  });
}

if (authForm) {
  authForm.addEventListener('submit', async (event) => {
    event.preventDefault();
    submitBtn.disabled = true;
    submitBtn.textContent = isSignup ? 'Creating...' : 'Signing in...';

    const mode = formModeInput.value;
    const payload = {
      mode,
      email: document.getElementById('email').value.trim(),
      password: document.getElementById('password').value,
      full_name: document.getElementById('full_name')?.value.trim() || '',
      phone: document.getElementById('phone')?.value.trim() || '',
      address: document.getElementById('address')?.value.trim() || ''
    };

    try {
      const response = await fetch('/api/auth.js', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      const data = await response.json();
      if (data.success) {
        localStorage.setItem(LOCAL_AUTH_TOKEN, data.token);
        localStorage.setItem(LOCAL_USER_INFO, JSON.stringify(data.user));
        window.location.href = data.redirect || 'profile.html';
      } else {
        alert(data.message || 'Authentication failed');
      }
    } catch (error) {
      console.error('Auth error', error);
      alert('Unable to connect to server');
    } finally {
      submitBtn.disabled = false;
      submitBtn.textContent = isSignup ? 'Create Account' : 'Sign In';
    }
  });
}
