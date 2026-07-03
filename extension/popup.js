document.addEventListener('DOMContentLoaded', () => {
  const backendUrlInput = document.getElementById('backend-url');
  const defaultToneSelect = document.getElementById('default-tone');
  const btnTestConnection = document.getElementById('btn-test-connection');
  const connectionDot = document.getElementById('connection-dot');
  const connectionText = document.getElementById('connection-text');
  const statAnalyzed = document.getElementById('stat-analyzed');
  const statGenerated = document.getElementById('stat-generated');
  const resetSettingsLink = document.getElementById('reset-settings');

  // Load saved settings
  chrome.storage.local.get(['backendUrl', 'defaultTone', 'statsAnalyzed', 'statsGenerated'], (data) => {
    if (data.backendUrl) {
      backendUrlInput.value = data.backendUrl;
    } else {
      backendUrlInput.value = 'http://localhost:3001';
    }

    if (data.defaultTone) {
      defaultToneSelect.value = data.defaultTone;
    }

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
    });
  });

  defaultToneSelect.addEventListener('change', () => {
    chrome.storage.local.set({ defaultTone: defaultToneSelect.value });
  });

  // Test connection button click
  btnTestConnection.addEventListener('click', () => {
    checkConnection(backendUrlInput.value.trim());
  });

  // Reset defaults
  resetSettingsLink.addEventListener('click', (e) => {
    e.preventDefault();
    backendUrlInput.value = 'http://localhost:3001';
    defaultToneSelect.value = 'conversational';
    chrome.storage.local.set({
      backendUrl: 'http://localhost:3001',
      defaultTone: 'conversational'
    }, () => {
      checkConnection('http://localhost:3001');
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
      // We will hit a health check endpoint, e.g. /api/health
      const healthUrl = `${url.replace(/\/$/, '')}/api/health`;
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 4000); // 4s timeout

      const response = await fetch(healthUrl, {
        method: 'GET',
        signal: controller.signal,
        headers: {
          'Accept': 'application/json'
        }
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
