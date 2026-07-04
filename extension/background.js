// Background Service Worker for BidIQ

// Listen for messages from content scripts or popup
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.action === 'GENERATE_PROPOSAL') {
    generateProposal(message.data)
      .then(result => sendResponse({ success: true, proposal: result.proposal, instanceId: result.instanceId }))
      .catch(error => sendResponse({ success: false, error: error.message }));
    return true; // Keeps the message channel open for async response
  }
  
  if (message.action === 'UPDATE_STATS') {
    updateStats(message.type);
    sendResponse({ success: true });
    return false;
  }
});

// Function to call the secure Express API route
async function generateProposal({ 
  backendUrl, 
  jobTitle, 
  jobDescription, 
  clientMetrics, 
  tone, 
  focus, 
  userProfile, 
  clientUid, 
  licenseKey, 
  instanceId,
  freelancerScrapedInfo 
}) {
  const cleanUrl = (backendUrl || 'https://bidiq-o62g.onrender.com').replace(/\/$/, '');
  const endpoint = `${cleanUrl}/api/generate-proposal`;

  try {
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        jobTitle,
        jobDescription,
        clientMetrics,
        tone,
        focus,
        userProfile,
        clientUid,
        licenseKey,
        instanceId,
        freelancerScrapedInfo
      })
    });

    if (!response.ok) {
      const errText = await response.text();
      throw new Error(`Server returned ${response.status}: ${errText || response.statusText}`);
    }

    const data = await response.json();
    return {
      proposal: data.proposal || '',
      instanceId: data.instanceId || null
    };
  } catch (error) {
    console.error('Error generating proposal in background:', error);
    throw error;
  }
}

// Function to increment extension usage metrics
function updateStats(type) {
  chrome.storage.local.get(['statsAnalyzed', 'statsGenerated'], (data) => {
    if (type === 'analyzed') {
      const val = (data.statsAnalyzed || 0) + 1;
      chrome.storage.local.set({ statsAnalyzed: val });
    } else if (type === 'generated') {
      const val = (data.statsGenerated || 0) + 1;
      chrome.storage.local.set({ statsGenerated: val });
    }
  });
}
