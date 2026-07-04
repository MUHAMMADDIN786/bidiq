document.addEventListener('DOMContentLoaded', () => {
  const backendUrlInput = document.getElementById('backend-url');
  const defaultToneSelect = document.getElementById('default-tone');
  const userProfileTextarea = document.getElementById('user-profile');
  const licenseKeyInput = document.getElementById('license-key');
  const btnVerifyLicense = document.getElementById('btn-verify-license');
  const licenseBadge = document.getElementById('license-badge');
  const upgradeBtnWrapper = document.getElementById('upgrade-btn-wrapper');
  
  const toneGroup = document.getElementById('tone-group');
  const profileCardGated = document.getElementById('profile-card-gated');
  
  const btnTestConnection = document.getElementById('btn-test-connection');
  const connectionDot = document.getElementById('connection-dot');
  const connectionText = document.getElementById('connection-text');
  const statAnalyzed = document.getElementById('stat-analyzed');
  const statGenerated = document.getElementById('stat-generated');
  const resetSettingsLink = document.getElementById('reset-settings');
  let currentClientUid = '';
  let currentInstanceId = '';

  const defaultProfile = `Name: Muhammad Din
Role: Senior AI Engineer & Systems Architect
Portfolio: https://muhammad-din.vercel.app/
GitHub: https://github.com/MUHAMMADDIN786
Upwork: https://www.upwork.com/freelancers/~01f8ce5ce11decf069

Core Expertise:
- Custom B2B Automation Workflows (n8n, Make.com, Zapier)
- Conversational AI Voice Agents (Vapi.ai, Retell AI, Bland AI)
- Cost-reduction migration (migrating high-cost Zapier flows to self-hosted n8n VPS, saving ~98%)
- React/Next.js dynamic web applications & secure backend microservices (Express, Node, TS)
- High-performance API routing and AI agent orchestration`;

  // Generate Unique Client ID if not exists
  function generateUid() {
    return 'uid-' + Date.now().toString(36) + '-' + Math.random().toString(36).substr(2, 9);
  }

  chrome.storage.local.get([
    'backendUrl', 
    'defaultTone', 
    'statsAnalyzed', 
    'statsGenerated', 
    'userProfile', 
    'clientUid', 
    'licenseKey',
    'instanceId'
  ], (data) => {
    currentInstanceId = data.instanceId || '';
    // Backend URL
    if (data.backendUrl) {
      backendUrlInput.value = data.backendUrl;
    } else {
      backendUrlInput.value = 'https://bidiq-o62g.onrender.com';
    }

    // Default Tone
    if (data.defaultTone) {
      defaultToneSelect.value = data.defaultTone;
    }

    // Professional Context Profile
    if (data.userProfile) {
      userProfileTextarea.value = data.userProfile;
    } else {
      userProfileTextarea.value = defaultProfile;
      chrome.storage.local.set({ userProfile: defaultProfile });
    }

    // Generate Client UID
    let uid = data.clientUid;
    if (!uid) {
      uid = generateUid();
      chrome.storage.local.set({ clientUid: uid });
    }
    currentClientUid = uid;

    // License Key
    if (data.licenseKey) {
      licenseKeyInput.value = data.licenseKey;
      verifyLicenseKey(data.licenseKey, backendUrlInput.value);
    } else {
      setLicenseState(false);
    }

    // Stats
    statAnalyzed.textContent = data.statsAnalyzed || 0;
    statGenerated.textContent = data.statsGenerated || 0;

    // Test connection initially
    checkConnection(backendUrlInput.value);
  });

  // Save changes when settings are changed
  backendUrlInput.addEventListener('change', () => {
    let url = backendUrlInput.value.trim();
    if (url && !url.startsWith('http://') && !url.startsWith('https://')) {
      url = 'http://' + url;
      backendUrlInput.value = url;
    }
    chrome.storage.local.set({ backendUrl: url }, () => {
      checkConnection(url);
      if (licenseKeyInput.value.trim()) {
        verifyLicenseKey(licenseKeyInput.value.trim(), url);
      }
    });
  });

  defaultToneSelect.addEventListener('change', () => {
    chrome.storage.local.set({ defaultTone: defaultToneSelect.value });
  });

  userProfileTextarea.addEventListener('change', () => {
    chrome.storage.local.set({ userProfile: userProfileTextarea.value });
  });

  licenseKeyInput.addEventListener('change', () => {
    const key = licenseKeyInput.value.trim();
    chrome.storage.local.set({ licenseKey: key }, () => {
      verifyLicenseKey(key, backendUrlInput.value);
    });
  });

  btnVerifyLicense.addEventListener('click', () => {
    verifyLicenseKey(licenseKeyInput.value.trim(), backendUrlInput.value);
  });

  // Test connection button click
  btnTestConnection.addEventListener('click', () => {
    checkConnection(backendUrlInput.value.trim());
  });

  // Reset defaults
  resetSettingsLink.addEventListener('click', (e) => {
    e.preventDefault();
    backendUrlInput.value = 'https://bidiq-o62g.onrender.com';
    defaultToneSelect.value = 'conversational';
    userProfileTextarea.value = defaultProfile;
    licenseKeyInput.value = '';
    currentInstanceId = '';
    
    chrome.storage.local.set({
      backendUrl: 'https://bidiq-o62g.onrender.com',
      defaultTone: 'conversational',
      userProfile: defaultProfile,
      licenseKey: '',
      instanceId: ''
    }, () => {
      checkConnection('https://bidiq-o62g.onrender.com');
      setLicenseState(false);
    });
  });

  // Function to test connectivity to backend
  async function checkConnection(url) {
    connectionDot.className = 'status-dot pinging';
    connectionText.textContent = 'Testing...';

    if (!url) {
      setDisconnected();
      return;
    }

    try {
      const healthUrl = `${url.replace(/\/$/, '')}/api/health`;
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 4000); // 4s timeout

      const response = await fetch(healthUrl, {
        method: 'GET',
        signal: controller.signal,
        headers: { 'Accept': 'application/json' }
      });
      clearTimeout(timeoutId);

      if (response.ok) {
        setConnected();
      } else {
        setDisconnected();
      }
    } catch (error) {
      console.warn('Backend ping failed:', error);
      setDisconnected();
    }
  }

  // Verify license key with the backend
  async function verifyLicenseKey(key, url) {
    if (!key) {
      setLicenseState(false);
      return;
    }

    try {
      const verifyUrl = `${url.replace(/\/$/, '')}/api/verify-license`;
      const response = await fetch(verifyUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ licenseKey: key, clientUid: currentClientUid, instanceId: currentInstanceId })
      });

      const data = await response.json();
      if (response.ok && data.valid) {
        if (data.instanceId) {
          currentInstanceId = data.instanceId;
          chrome.storage.local.set({ instanceId: data.instanceId });
        }
        setLicenseState(true, data.message);
      } else {
        setLicenseState(false, data.message);
      }
    } catch (e) {
      // Fallback: local evaluation offline if backend is unreachable
      console.warn('Backend license verify failed, evaluating locally:', e);
      if (key.trim().toUpperCase().startsWith('BIDIQ-PREM-')) {
        setLicenseState(true, 'Premium unlocked offline.');
      } else {
        setLicenseState(false, 'Invalid key.');
      }
    }
  }

  function setLicenseState(isPremium, message) {
    if (isPremium) {
      licenseBadge.textContent = 'Premium Active';
      licenseBadge.className = 'license-status-badge premium';
      upgradeBtnWrapper.style.display = 'none';
      
      // Unlock premium gated UI elements
      toneGroup.classList.add('unlocked');
      profileCardGated.classList.add('unlocked');
      defaultToneSelect.disabled = false;
      userProfileTextarea.disabled = false;
    } else {
      licenseBadge.textContent = message || 'Free Tier (3/day)';
      licenseBadge.className = 'license-status-badge';
      upgradeBtnWrapper.style.display = 'block';
      
      // Lock premium gated UI elements
      toneGroup.classList.remove('unlocked');
      profileCardGated.classList.remove('unlocked');
      defaultToneSelect.disabled = true;
      userProfileTextarea.disabled = true;
      
      // Force tone select to conversational on free lock
      defaultToneSelect.value = 'conversational';
      chrome.storage.local.set({ defaultTone: 'conversational' });
    }
  }

  function setConnected() {
    connectionDot.className = 'status-dot connected';
    connectionText.textContent = 'Connected';
    connectionText.style.color = '#10b981';
  }

  function setDisconnected() {
    connectionDot.className = 'status-dot disconnected';
    connectionText.textContent = 'Disconnected';
    connectionText.style.color = '#ef4444';
  }
});
