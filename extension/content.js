// BidIQ Content Script - Injected into Upwork pages
(function() {
  let panelContainer = null;
  let shadowRoot = null;
  let currentJobId = null;
  let scrapedData = null;

  // Poll or observe DOM changes to detect navigation on Upwork (SPA)
  function init() {
    setInterval(() => {
      const jobId = getJobIdFromUrl();
      if (jobId && jobId !== currentJobId) {
        currentJobId = jobId;
        // Wait a brief moment for dynamic content to load before scraping
        setTimeout(processPage, 1500);
      }
    }, 1500);

    // Run once on load
    setTimeout(processPage, 1000);
  }

  // Extract a unique identifier from the job details page URL
  function getJobIdFromUrl() {
    const url = window.location.href;
    // Matches e.g., upwork.com/jobs/~01b88e1a8cfc656041 or upwork.com/ab/jobs/search/...
    const jobMatch = url.match(/\/jobs\/([^/?#]+)/) || url.match(/details=([^&]+)/);
    return jobMatch ? jobMatch[1] : null;
  }

  // Inject panel shell into the page if it doesn't exist
  function ensurePanelInjected() {
    if (panelContainer) return;

    panelContainer = document.createElement('div');
    panelContainer.id = 'bidiq-extension-root';
    // Style the host container slightly so it doesn't affect page layout
    panelContainer.style.position = 'fixed';
    panelContainer.style.zIndex = '2147483647';
    document.body.appendChild(panelContainer);

    shadowRoot = panelContainer.attachShadow({ mode: 'open' });

    // Inject styles.css link into shadow DOM
    const link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = chrome.runtime.getURL('styles.css');
    shadowRoot.appendChild(link);

    // Create the structure inside Shadow DOM
    const widget = document.createElement('div');
    widget.className = 'bidiq-widget';
    widget.innerHTML = `
      <!-- Floating Toggle -->
      <div class="bidiq-trigger" id="bidiq-toggle-btn">
        <span class="bidiq-trigger-icon">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <path d="M12 2L2 7L12 12L22 7L12 2Z"/>
            <path d="M2 17L12 22L22 17"/>
            <path d="M2 12L12 17L22 12"/>
          </svg>
        </span>
        <span>BidIQ</span>
      </div>

      <!-- Slide-out Panel -->
      <div class="bidiq-panel" id="bidiq-side-panel">
        <header class="bidiq-header">
          <div class="bidiq-logo">
            <span style="display:flex; align-items:center;">
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                <path d="M12 2L2 7L12 12L22 7L12 2Z" fill="#6366f1"/>
                <path d="M2 17L12 22L22 17" stroke="#a855f7" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
                <path d="M2 12L12 17L22 12" stroke="#ec4899" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
              </svg>
            </span>
            <div class="bidiq-logo-text">Bid<span>IQ</span></div>
          </div>
          <button class="bidiq-close-btn" id="bidiq-close-btn" title="Close Panel">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <line x1="18" y1="6" x2="6" y2="18"></line>
              <line x1="6" y1="6" x2="18" y2="18"></line>
            </svg>
          </button>
        </header>

        <div class="bidiq-body">
          <!-- Client Risk Assessor Card -->
          <div class="bidiq-card">
            <div class="bidiq-section-title">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>
              </svg>
              Client Risk Assessor
            </div>
            
            <div class="risk-grid">
              <div class="risk-stat-card" id="card-hire-rate">
                <span class="risk-stat-value" id="val-hire-rate">--%</span>
                <span class="risk-stat-label">Hire Rate</span>
              </div>
              <div class="risk-stat-card" id="card-pay-rate">
                <span class="risk-stat-value" id="val-pay-rate">$--</span>
                <span class="risk-stat-label">Avg Pay Rate</span>
              </div>
            </div>

            <div class="risk-badge" id="val-risk-level">
              Analyzing client risk...
            </div>

            <div class="risk-factors-list" id="val-risk-factors">
              <!-- Dynamically populated -->
            </div>
          </div>

          <!-- Proposal Draft Generator Card -->
          <div class="bidiq-card">
            <div class="bidiq-section-title">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M12 20h9"></path>
                <path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"></path>
              </svg>
              AI Proposal Generator
            </div>

            <div class="bidiq-option-group">
              <div class="bidiq-option-label">Proposal Tone</div>
              <div class="bidiq-chips-row" id="tone-chips">
                <div class="bidiq-chip active" data-value="conversational">Conversational</div>
                <div class="bidiq-chip" data-value="professional">Professional</div>
                <div class="bidiq-chip" data-value="technical">Technical</div>
              </div>
            </div>

            <div class="bidiq-option-group">
              <div class="bidiq-option-label">Strategic Focus</div>
              <div class="bidiq-chips-row" id="focus-chips">
                <div class="bidiq-chip active" data-value="quality">Quality & Value</div>
                <div class="bidiq-chip" data-value="speed">Speed & Delivery</div>
                <div class="bidiq-chip" data-value="cost">Cost Efficiency</div>
              </div>
            </div>

            <div class="bidiq-textarea-wrapper">
              <textarea class="bidiq-proposal-textarea" id="proposal-output" placeholder="AI drafted proposal will appear here..."></textarea>
              <div class="bidiq-toast" id="copy-toast">Copied to Clipboard!</div>
            </div>

            <button class="bidiq-btn-primary" id="btn-generate">
              <span id="btn-gen-text">Generate Proposal</span>
            </button>

            <div class="bidiq-actions-row">
              <button class="bidiq-btn-secondary" id="btn-copy">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect>
                  <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path>
                </svg>
                Copy Draft
              </button>
              <button class="bidiq-btn-secondary" id="btn-insert">
                Apply to Form
              </button>
            </div>
          </div>
        </div>
      </div>
    `;

    shadowRoot.appendChild(widget);

    // Hook up UI events
    setupPanelEvents();
  }

  function setupPanelEvents() {
    const toggleBtn = shadowRoot.getElementById('bidiq-toggle-btn');
    const closeBtn = shadowRoot.getElementById('bidiq-close-btn');
    const panel = shadowRoot.getElementById('bidiq-side-panel');
    const btnGenerate = shadowRoot.getElementById('btn-generate');
    const btnCopy = shadowRoot.getElementById('btn-copy');
    const btnInsert = shadowRoot.getElementById('btn-insert');
    const proposalOutput = shadowRoot.getElementById('proposal-output');
    const copyToast = shadowRoot.getElementById('copy-toast');
    const toneChips = shadowRoot.querySelectorAll('#tone-chips .bidiq-chip');
    const focusChips = shadowRoot.querySelectorAll('#focus-chips .bidiq-chip');

    // Slide panel open/close
    toggleBtn.addEventListener('click', () => {
      panel.classList.add('open');
      toggleBtn.style.opacity = '0';
      toggleBtn.style.pointerEvents = 'none';
    });

    closeBtn.addEventListener('click', () => {
      panel.classList.remove('open');
      toggleBtn.style.opacity = '1';
      toggleBtn.style.pointerEvents = 'auto';
    });

    // Chip selections
    setupChips(toneChips);
    setupChips(focusChips);

    // Generate Proposal Click
    btnGenerate.addEventListener('click', async () => {
      if (!scrapedData) {
        alert('Please open an active job details page first.');
        return;
      }

      setGeneratingState(true);

      // Load Settings from storage
      chrome.storage.local.get(['backendUrl'], async (settings) => {
        const backendUrl = settings.backendUrl || 'http://localhost:3000';
        const activeTone = shadowRoot.querySelector('#tone-chips .bidiq-chip.active').dataset.value;
        const activeFocus = shadowRoot.querySelector('#focus-chips .bidiq-chip.active').dataset.value;

        // Send message to background script to call Next.js backend
        chrome.runtime.sendMessage({
          action: 'GENERATE_PROPOSAL',
          data: {
            backendUrl,
            jobTitle: scrapedData.title,
            jobDescription: scrapedData.description,
            clientMetrics: scrapedData.client,
            tone: activeTone,
            focus: activeFocus
          }
        }, (response) => {
          setGeneratingState(false);
          if (response && response.success) {
            proposalOutput.value = response.proposal;
            // Track generated proposal in stats
            chrome.runtime.sendMessage({ action: 'UPDATE_STATS', type: 'generated' });
          } else {
            proposalOutput.value = `Error generating proposal:\n${response ? response.error : 'Could not reach backend API.'}\n\nMake sure your Next.js server is running and configured.`;
          }
        });
      });
    });

    // Copy to clipboard
    btnCopy.addEventListener('click', () => {
      const text = proposalOutput.value;
      if (!text) return;
      
      navigator.clipboard.writeText(text).then(() => {
        copyToast.classList.add('show');
        setTimeout(() => copyToast.classList.remove('show'), 2000);
      });
    });

    // Apply to Upwork form field (if proposal textarea is present on the page)
    btnInsert.addEventListener('click', () => {
      const proposalText = proposalOutput.value;
      if (!proposalText) return;

      // Common Upwork proposal cover letter textareas
      const coverLetterArea = document.querySelector('textarea[aria-labelledby*="cover-letter"]') || 
                              document.querySelector('textarea[name*="coverLetter"]') || 
                              document.querySelector('.up-textarea textarea');

      if (coverLetterArea) {
        coverLetterArea.value = proposalText;
        // Dispatch events so React/Vue components on Upwork detect the change
        coverLetterArea.dispatchEvent(new Event('input', { bubbles: true }));
        coverLetterArea.dispatchEvent(new Event('change', { bubbles: true }));
        
        // Show success alert
        alert('Proposal draft successfully applied to the cover letter field!');
      } else {
        alert('Could not find cover letter field. Please copy and paste the draft manually.');
      }
    });
  }

  function setupChips(chips) {
    chips.forEach(chip => {
      chip.addEventListener('click', () => {
        chips.forEach(c => c.classList.remove('active'));
        chip.classList.add('active');
      });
    });
  }

  function setGeneratingState(isGenerating) {
    const btn = shadowRoot.getElementById('btn-generate');
    const btnText = shadowRoot.getElementById('btn-gen-text');
    
    if (isGenerating) {
      btn.disabled = true;
      btnText.innerHTML = '<span class="loader-spinner"></span> Generating...';
    } else {
      btn.disabled = false;
      btnText.innerHTML = 'Generate Proposal';
    }
  }

  // Scrapes the client details and job text from the page
  function processPage() {
    // 1. Check if we are on a job details page
    const titleEl = document.querySelector('[data-qa="job-title"]') || 
                    document.querySelector('.fe-job-details-header h1') || 
                    document.querySelector('.job-details-header h1') || 
                    document.querySelector('h1');
                    
    const descEl = document.querySelector('[data-test="job-description"]') || 
                   document.querySelector('.fe-job-details-description') || 
                   document.querySelector('.job-description') ||
                   document.querySelector('.up-line-clamp');

    if (!titleEl || !descEl) {
      console.log('BidIQ: Not a job details page or elements not loaded yet.');
      return;
    }

    ensurePanelInjected();

    // 2. Scrape job details
    const title = titleEl.textContent.trim();
    const description = descEl.textContent.trim();

    // 3. Scrape Client Metrics using flexible heuristics (regular expressions & DOM parsing)
    const pageText = document.body.innerText;
    
    // Scrape Hire Rate (e.g., "75% hire rate")
    let hireRate = null;
    const hireRateMatch = pageText.match(/(\d+)%\s+hire\s+rate/i);
    if (hireRateMatch) {
      hireRate = parseInt(hireRateMatch[1], 10);
    } else {
      // Fallback: look in client stats container
      const hireEl = document.querySelector('[data-test="client-stats"]') || document.querySelector('.fe-client-stats');
      if (hireEl) {
        const m = hireEl.innerText.match(/(\d+)%/);
        if (m) hireRate = parseInt(m[1], 10);
      }
    }

    // Scrape Average Pay Rate (e.g., "$25.00/hr avg hourly rate paid" or "$25.50 average hourly rate paid")
    let avgPayRate = null;
    const payRateMatch = pageText.match(/\$(\d+(?:\.\d+)?)\/hr\s+avg\s+hourly/i) || 
                         pageText.match(/\$(\d+(?:\.\d+)?)\s+average\s+hourly/i);
    if (payRateMatch) {
      avgPayRate = parseFloat(payRateMatch[1]);
    } else {
      // Search for any pattern like "$12.34/hr avg"
      const m = pageText.match(/\$(\d+(?:\.\d+)?)\/hr/i);
      if (m) avgPayRate = parseFloat(m[1]);
    }

    // Payment Verification Status
    const isPaymentVerified = pageText.toLowerCase().includes('payment verified') || 
                              !!document.querySelector('[data-qa="payment-verified"]') ||
                              !!document.querySelector('.payment-verified');

    scrapedData = {
      title,
      description,
      client: {
        hireRate,
        avgPayRate,
        paymentVerified: isPaymentVerified
      }
    };

    console.log('BidIQ Scraped Data:', scrapedData);

    // 4. Update UI with scraped data
    updateUI(scrapedData.client);

    // Track analyzed job in stats
    chrome.runtime.sendMessage({ action: 'UPDATE_STATS', type: 'analyzed' });
  }

  // Update the Risk Assessor card components
  function updateUI(client) {
    const valHireRate = shadowRoot.getElementById('val-hire-rate');
    const valPayRate = shadowRoot.getElementById('val-pay-rate');
    const cardHireRate = shadowRoot.getElementById('card-hire-rate');
    const cardPayRate = shadowRoot.getElementById('card-pay-rate');
    const valRiskLevel = shadowRoot.getElementById('val-risk-level');
    const valRiskFactors = shadowRoot.getElementById('val-risk-factors');

    // Reset styles
    cardHireRate.className = 'risk-stat-card';
    cardPayRate.className = 'risk-stat-card';
    valRiskFactors.innerHTML = '';

    const factors = [];

    // Process Hire Rate
    if (client.hireRate !== null) {
      valHireRate.textContent = `${client.hireRate}%`;
      if (client.hireRate >= 70) {
        cardHireRate.classList.add('emerald');
      } else if (client.hireRate >= 45) {
        cardHireRate.classList.add('amber');
        factors.push({ type: 'warning', text: `Moderate Hire Rate (${client.hireRate}%) - client open to hiring but selective.` });
      } else {
        cardHireRate.classList.add('rose');
        factors.push({ type: 'danger', text: `Low Hire Rate (${client.hireRate}%) - client posts but rarely hires.` });
      }
    } else {
      valHireRate.textContent = 'N/A';
      factors.push({ type: 'warning', text: 'No hire rate history available (New client or private job).' });
    }

    // Process Pay Rate
    if (client.avgPayRate !== null) {
      valPayRate.textContent = `$${client.avgPayRate.toFixed(2)}`;
      if (client.avgPayRate >= 30) {
        cardPayRate.classList.add('emerald');
      } else if (client.avgPayRate >= 15) {
        cardPayRate.classList.add('amber');
      } else {
        cardPayRate.classList.add('rose');
        factors.push({ type: 'warning', text: `Low Average Pay Rate ($${client.avgPayRate.toFixed(2)}/hr) - client has budget-sensitive history.` });
      }
    } else {
      valPayRate.textContent = 'N/A';
    }

    // Process Payment Verification
    if (!client.paymentVerified) {
      factors.push({ type: 'danger', text: 'Payment Method Unverified - higher risk of project suspension.' });
    }

    // Determine aggregate Risk Badge
    let dangerCount = factors.filter(f => f.type === 'danger').length;
    let warningCount = factors.filter(f => f.type === 'warning').length;

    if (dangerCount > 0) {
      valRiskLevel.textContent = '⚠️ CRITICAL RISK FLAG';
      valRiskLevel.className = 'risk-badge danger';
    } else if (warningCount > 0) {
      valRiskLevel.textContent = '⚡ MODERATE RISK WARNING';
      valRiskLevel.className = 'risk-badge warning';
    } else {
      valRiskLevel.textContent = '✅ LOW RISK CLIENT';
      valRiskLevel.className = 'risk-badge safe';
    }

    // Render Factor list elements
    if (factors.length === 0) {
      valRiskFactors.innerHTML = `
        <div class="risk-factor-item">
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#10b981" stroke-width="3">
            <path d="M20 6L9 17l-5-5"/>
          </svg>
          Client history meets all security standards.
        </div>
      `;
    } else {
      factors.forEach(f => {
        const color = f.type === 'danger' ? '#ef4444' : '#f59e0b';
        const item = document.createElement('div');
        item.className = `risk-factor-item ${f.type}`;
        item.innerHTML = `
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="${color}" stroke-width="2.5">
            <path d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"/>
          </svg>
          ${f.text}
        `;
        valRiskFactors.appendChild(item);
      });
    }
  }

  // Start initialization
  init();
})();
