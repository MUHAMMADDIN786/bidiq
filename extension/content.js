// BidIQ Content Script - Injected into Upwork pages
(function() {
  let panelContainer = null;
  let shadowRoot = null;
  let currentJobId = null;
  let scrapedData = null;
  let pageScrapedSuccessfully = false;

  // Poll or observe DOM changes to detect navigation on Upwork (SPA)
  function init() {
    console.log('BidIQ Content Script: Starting initialization...');
    
    // Inject the floating toggle button immediately on page load
    ensurePanelInjected();

    setInterval(() => {
      const jobId = getJobIdFromUrl();
      if (jobId) {
        if (jobId !== currentJobId) {
          currentJobId = jobId;
          pageScrapedSuccessfully = false;
          // Wait a brief moment for dynamic content to load before scraping
          setTimeout(processPage, 1200);
        } else if (!pageScrapedSuccessfully) {
          // Keep attempting to scrape the page details if it failed on previous ticks
          processPage();
        }
      }
    }, 1200);

    // Run once on load
    setTimeout(processPage, 1000);
  }

  // Extract a unique identifier from the job details page URL or active panel
  function getJobIdFromUrl() {
    const url = window.location.href;
    const jobMatch = url.match(/\/jobs\/([^/?#]+)/) || url.match(/details=([^&]+)/) || url.match(/job=([^&]+)/);
    if (jobMatch) return jobMatch[1];

    // Check if slider drawer is open
    const drawer = document.querySelector('[data-test="job-details-drawer"]') || 
                   document.querySelector('.job-details-panel') || 
                   document.querySelector('.slider-panel');
    if (drawer) {
      return 'drawer-' + drawer.innerText.substring(0, 30).replace(/[^a-zA-Z0-9]/g, '');
    }
    return null;
  }

  // Helper to isolate and extract text from the client info block
  function getClientSectionText() {
    const selectors = [
      '[data-test="client-stats"]',
      '.fe-client-stats',
      '.client-about',
      '[data-qa="client-about"]',
      'section[class*="client-about"]',
      'aside',
      '#sidebar',
      'div[class*="client-history"]',
      '[data-qa="client-job-history"]',
      '.job-details-panel',
      '.slider-panel',
      '[data-test="job-details-drawer"]'
    ];

    for (const selector of selectors) {
      const el = document.querySelector(selector);
      if (el) {
        const text = el.innerText.trim();
        // Check if the element has text and actually contains client metrics keywords
        if (text.length > 30 && (
          text.toLowerCase().includes('hire') || 
          text.toLowerCase().includes('spent') || 
          text.toLowerCase().includes('spend') || 
          text.toLowerCase().includes('rating') || 
          text.toLowerCase().includes('payment') ||
          text.toLowerCase().includes('client') ||
          text.toLowerCase().includes('about')
        )) {
          return text;
        }
      }
    }
    return '';
  }

  // Scrapes freelancer hourly rate/profile title from the page if available
  function parseFreelancerBaseline() {
    // 1. Scrape Freelancer Hourly Rate
    let rate = null;
    const rateInput = document.querySelector('[data-test="hourly-rate-input"]') || 
                      document.querySelector('input[name*="hourlyRate"]') ||
                      document.querySelector('.up-input-group input') ||
                      document.querySelector('input[name*="rate"]');
                      
    if (rateInput && rateInput.value) {
      rate = rateInput.value.trim();
      if (!rate.startsWith('$')) rate = '$' + rate;
      if (!rate.toLowerCase().includes('/hr') && !rate.toLowerCase().includes('fixed')) rate += '/hr';
    } else {
      // Look for a general profile rate text indicator on the page
      const elements = Array.from(document.querySelectorAll('span, div, strong'));
      for (const el of elements) {
        if (el.innerText && el.innerText.match(/^\$\d+(?:\.\d+)?\/hr$/)) {
          rate = el.innerText.trim();
          break;
        }
      }
    }

    // 2. Scrape Freelancer Profile Title
    let profileTitle = null;
    const titleEl = document.querySelector('[data-test="profile-selector"] span') || 
                    document.querySelector('[data-qa="profile-title"]') || 
                    document.querySelector('.profile-title') ||
                    document.querySelector('.up-dropdown-toggle') ||
                    document.querySelector('.fe-proposal-profile-title');
    if (titleEl) {
      profileTitle = titleEl.textContent.trim();
    }

    return {
      rate: rate || 'Not specified (using profile baseline rate)',
      profileTitle: profileTitle || 'Not specified (using profile baseline title)'
    };
  }

  // Inject panel shell into the page if it doesn't exist
  function ensurePanelInjected() {
    if (panelContainer) return;

    panelContainer = document.createElement('div');
    panelContainer.id = 'bidiq-extension-root';
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
          <div style="display:flex; align-items:center; gap:8px;">
            <button class="bidiq-refresh-btn" id="bidiq-refresh-btn" title="Refresh/Rescrape Page" style="transform:none; border-radius:50%;">
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <path d="M21.5 2v6h-6M21.34 15.57a10 10 0 1 1-.57-8.38l5.67-5.67"/>
              </svg>
            </button>
            <button class="bidiq-close-btn" id="bidiq-close-btn" title="Close Panel">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <line x1="18" y1="6" x2="6" y2="18"></line>
                <line x1="6" y1="6" x2="18" y2="18"></line>
              </svg>
            </button>
          </div>
        </header>

        <div class="bidiq-body">
          <!-- 1. Client Risk Assessor Card -->
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
              <div class="risk-stat-card" id="card-total-spend">
                <span class="risk-stat-value" id="val-total-spend">$--</span>
                <span class="risk-stat-label">Total Spend</span>
              </div>
              <div class="risk-stat-card" id="card-rating">
                <span class="risk-stat-value" id="val-rating">--</span>
                <span class="risk-stat-label">Rating</span>
              </div>
            </div>

            <!-- Client Metadata Row -->
            <div style="display:flex; justify-content:space-between; align-items:center; font-size:11px; color:var(--bidiq-text-muted); background:rgba(255,255,255,0.02); padding:8px 12px; border-radius:8px; border:1px solid var(--bidiq-border);" id="client-meta-row">
              <span id="val-client-location">📍 Location: --</span>
              <span id="val-payment-status" style="font-weight:600;">💳 Unverified</span>
            </div>

            <div class="risk-badge" id="val-risk-level">
              Analyzing client risk...
            </div>

            <div class="risk-factors-list" id="val-risk-factors">
              <!-- Dynamically populated -->
            </div>
          </div>

          <!-- 2. Freelancer Context Card (Hybrid Info) -->
          <div class="bidiq-card premium-gated collapsed" id="sidebar-profile-card">
            <div class="bidiq-section-title" style="display:flex; justify-content:space-between; width:100%;">
              <span style="display:flex; align-items:center; gap:6px;">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"></path>
                  <circle cx="12" cy="7" r="4"></circle>
                </svg>
                Freelancer Context
              </span>
              <span class="lock-indicator" id="profile-lock-badge" style="color:#fb923c; font-size:9.5px; font-weight:700;">🔒 Pro gated</span>
            </div>

            <!-- Scraped Info Row (Hybrid Baseline) -->
            <div style="background:rgba(255,255,255,0.02); border:1px solid var(--bidiq-border); padding:10px; border-radius:8px; display:flex; flex-direction:column; gap:6px; font-size:11px;">
              <div style="display:flex; justify-content:space-between;">
                <span style="color:var(--bidiq-text-muted);">Scraped Title:</span>
                <span id="sidebar-scraped-title" style="font-weight:600; color:var(--bidiq-text-main); text-align:right; max-width:180px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">Searching...</span>
              </div>
              <div style="display:flex; justify-content:space-between;">
                <span style="color:var(--bidiq-text-muted);">Scraped Bid Rate:</span>
                <span id="sidebar-scraped-rate" style="font-weight:600; color:var(--bidiq-text-main);">Searching...</span>
              </div>
            </div>

            <!-- Custom Bio Input -->
            <div class="bidiq-option-group">
              <div class="bidiq-option-label" style="font-size:11px; margin-bottom:4px; line-height:1.4;">Custom Resume Highlights / Portfolio (Optional):</div>
              <textarea id="sidebar-user-profile" style="width:100%; height:110px; background:rgba(255,255,255,0.03); border:1px solid var(--bidiq-border); border-radius:10px; padding:8px 10px; color:var(--bidiq-text-main); font-size:11px; font-family:var(--bidiq-font); resize:none; outline:none; line-height:1.4;" placeholder="Paste details about your highlights, bio, or past work here to guide the AI proposal generator."></textarea>
            </div>
          </div>

          <!-- 3. Proposal Draft Generator Card -->
          <div class="bidiq-card">
            <div class="bidiq-section-title">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M12 20h9"></path>
                <path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"></path>
              </svg>
              AI Proposal Generator
            </div>

            <div class="bidiq-option-group">
              <div class="bidiq-option-label" style="display:flex; justify-content:space-between;">
                <span>Proposal Tone</span>
                <span class="lock-indicator" id="tone-lock-badge" style="color:#fb923c; font-size:9.5px; font-weight:700;">🔒 Pro gated</span>
              </div>
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

          <!-- 4. License & Status Card -->
          <div class="bidiq-card collapsed" id="sidebar-license-card">
            <div class="bidiq-section-title">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <rect x="3" y="11" width="18" height="11" rx="2" ry="2"></rect>
                <path d="M7 11V7a5 5 0 0 1 10 0v4"></path>
              </svg>
              License & Status
            </div>
            
            <div class="bidiq-option-group">
              <div style="display:flex; gap:8px;">
                <input type="text" id="sidebar-license-key" placeholder="Enter BIDIQ-PREM- key" style="flex:1; background:rgba(255,255,255,0.03); border:1px solid var(--bidiq-border); border-radius:8px; padding:8px 12px; color:var(--bidiq-text-main); font-size:11px; font-family:var(--bidiq-font); outline:none;">
                <button id="sidebar-btn-verify-license" class="bidiq-btn-secondary" style="padding:0 12px; height:34px; border-radius:8px; margin:0; flex-shrink:0;">Verify</button>
              </div>
              <div id="sidebar-license-badge" style="font-size:11px; margin-top:4px; font-weight:600; color:var(--bidiq-text-muted);">Checking status...</div>
              
              <div id="sidebar-upgrade-btn-wrapper" style="margin-top:10px;">
                <a href="https://bidiq.lemonsqueezy.com" target="_blank" class="bidiq-btn-primary" style="display:block; text-align:center; text-decoration:none; padding:10px; font-size:12px; font-weight:700; border-radius:8px; background:linear-gradient(135deg, #ec4899 0%, #a855f7 100%);">✨ Get Premium License ($9/mo)</a>
              </div>
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
    // Setup collapsible cards (accordion style)
    const cards = shadowRoot.querySelectorAll('.bidiq-card');
    cards.forEach(card => {
      const title = card.querySelector('.bidiq-section-title');
      if (title) {
        // Create toggle arrow chevron
        const chevron = document.createElement('span');
        chevron.className = 'bidiq-card-toggle';
        chevron.style.marginLeft = 'auto';
        chevron.style.display = 'flex';
        chevron.style.alignItems = 'center';
        chevron.innerHTML = `
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
            <polyline points="6 9 12 15 18 9"></polyline>
          </svg>
        `;
        title.appendChild(chevron);
        title.style.cursor = 'pointer';
        
        title.addEventListener('click', (e) => {
          // Prevent collapse if clicking input elements, buttons, or badges
          if (e.target.closest('input') || e.target.closest('button') || e.target.closest('a') || e.target.closest('.lock-indicator')) {
            return;
          }
          card.classList.toggle('collapsed');
        });
      }
    });

    const toggleBtn = shadowRoot.getElementById('bidiq-toggle-btn');
    const closeBtn = shadowRoot.getElementById('bidiq-close-btn');
    const refreshBtn = shadowRoot.getElementById('bidiq-refresh-btn');
    const panel = shadowRoot.getElementById('bidiq-side-panel');
    const btnGenerate = shadowRoot.getElementById('btn-generate');
    const btnCopy = shadowRoot.getElementById('btn-copy');
    const btnInsert = shadowRoot.getElementById('btn-insert');
    const proposalOutput = shadowRoot.getElementById('proposal-output');
    const copyToast = shadowRoot.getElementById('copy-toast');
    const toneChips = shadowRoot.querySelectorAll('#tone-chips .bidiq-chip');
    const focusChips = shadowRoot.querySelectorAll('#focus-chips .bidiq-chip');

    const btnVerifySidebar = shadowRoot.getElementById('sidebar-btn-verify-license');
    const inputSidebarKey = shadowRoot.getElementById('sidebar-license-key');
    const textareaProfile = shadowRoot.getElementById('sidebar-user-profile');

    // Save profile context on input change
    if (textareaProfile) {
      textareaProfile.addEventListener('input', () => {
        chrome.storage.local.set({ userProfile: textareaProfile.value });
      });
    }

    // Verify license button
    if (btnVerifySidebar) {
      btnVerifySidebar.addEventListener('click', () => {
        verifySidebarLicenseKey(inputSidebarKey.value.trim());
      });
    }

    if (inputSidebarKey) {
      inputSidebarKey.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') {
          verifySidebarLicenseKey(inputSidebarKey.value.trim());
        }
      });
    }

    // Slide panel open/close
    toggleBtn.addEventListener('click', () => {
      panel.classList.add('open');
      toggleBtn.style.opacity = '0';
      toggleBtn.style.pointerEvents = 'none';
      
      // Refresh local settings in side panel
      loadSidebarSettings();
      
      // Force rescrape when opening panel
      processPage();
    });

    closeBtn.addEventListener('click', () => {
      panel.classList.remove('open');
      toggleBtn.style.opacity = '1';
      toggleBtn.style.pointerEvents = 'auto';
    });

    // Refresh manually
    refreshBtn.addEventListener('click', () => {
      refreshBtn.style.transform = 'rotate(360deg)';
      refreshBtn.style.transition = 'transform 0.5s ease';
      setTimeout(() => {
        refreshBtn.style.transform = 'none';
        refreshBtn.style.transition = 'none';
      }, 500);
      processPage();
    });

    // Chip selections (Tones are gated, Focuses are free)
    setupChips(toneChips, true);
    setupChips(focusChips, false);

    // Generate Proposal Click
    btnGenerate.addEventListener('click', async () => {
      if (!scrapedData) {
        alert('Please open an active job details page first.');
        return;
      }

      setGeneratingState(true);

      // Load Settings from storage
      chrome.storage.local.get(['backendUrl', 'userProfile', 'clientUid', 'licenseKey', 'instanceId'], async (settings) => {
        const backendUrl = settings.backendUrl || 'https://bidiq-o52g.onrender.com';
        
        // Generate Client ID if missing (ensuring limit tracking works even if popup hasn't opened)
        let clientUid = settings.clientUid;
        if (!clientUid) {
          clientUid = 'uid-' + Date.now().toString(36) + '-' + Math.random().toString(36).substr(2, 9);
          chrome.storage.local.set({ clientUid });
        }

        // Check license status locally to gate payloads securely
        const isPremium = settings.licenseKey && (settings.licenseKey.trim().toUpperCase().startsWith('BIDIQ-PREM-') || settings.instanceId);
        
        // Gate parameters securely
        const activeTone = isPremium ? 
          (shadowRoot.querySelector('#tone-chips .bidiq-chip.active')?.dataset.value || 'conversational') : 
          'conversational';
          
        const activeFocus = shadowRoot.querySelector('#focus-chips .bidiq-chip.active')?.dataset.value || 'quality';
        const userProfile = isPremium ? (settings.userProfile || '') : '';
        
        if (!isPremium) {
          // Visually force the conversational chip active
          toneChips.forEach(c => {
            if (c.dataset.value === 'conversational') c.classList.add('active');
            else c.classList.remove('active');
          });
        }

        // Scrape baseline freelancer profile parameters dynamically
        const freelancerScrapedInfo = parseFreelancerBaseline();

        // Send message to background script to call backend
        chrome.runtime.sendMessage({
          action: 'GENERATE_PROPOSAL',
          data: {
            backendUrl,
            jobTitle: scrapedData.title,
            jobDescription: scrapedData.description,
            clientMetrics: scrapedData.client,
            tone: activeTone,
            focus: activeFocus,
            userProfile,
            clientUid: clientUid,
            licenseKey: settings.licenseKey || '',
            instanceId: settings.instanceId || '',
            freelancerScrapedInfo
          }
        }, (response) => {
          setGeneratingState(false);
          if (response && response.success) {
            proposalOutput.value = response.proposal;
            
            // Save instanceId returned from successful backend registration
            if (response.instanceId) {
              chrome.storage.local.set({ instanceId: response.instanceId });
            }

            // Track generated proposal in stats
            chrome.runtime.sendMessage({ action: 'UPDATE_STATS', type: 'generated' });
          } else {
            const errMsg = response ? response.error : 'Could not reach backend API.';
            proposalOutput.value = `Error generating proposal:\n${errMsg}`;
            
            // Check if rate limit or generation limit is reached
            if (errMsg.includes('429') || errMsg.toLowerCase().includes('limit reached')) {
              highlightLicenseSection();
            }
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

    // Initial load of settings and limits UI inside side panel
    loadSidebarSettings();
  }

  function setupChips(chips, isTone = false) {
    chips.forEach(chip => {
      chip.addEventListener('click', () => {
        if (isTone && chip.dataset.value !== 'conversational') {
          // Gate non-conversational tones
          chrome.storage.local.get(['licenseKey', 'instanceId'], (settings) => {
            const isPremium = settings.licenseKey && (settings.licenseKey.trim().toUpperCase().startsWith('BIDIQ-PREM-') || settings.instanceId);
            if (!isPremium) {
              highlightLicenseSection();
              return;
            }
            chips.forEach(c => c.classList.remove('active'));
            chip.classList.add('active');
          });
          return;
        }

        chips.forEach(c => c.classList.remove('active'));
        chip.classList.add('active');
      });
    });
  }

  function highlightLicenseSection() {
    const licenseCard = shadowRoot.getElementById('sidebar-license-card');
    const licenseInput = shadowRoot.getElementById('sidebar-license-key');
    if (licenseCard) {
      licenseCard.classList.remove('collapsed');
      licenseCard.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
    if (licenseInput) {
      licenseInput.focus();
      
      // Visual feedback flash
      licenseInput.style.transition = 'border-color 0.2s ease, box-shadow 0.2s ease';
      licenseInput.style.borderColor = '#ec4899';
      licenseInput.style.boxShadow = '0 0 0 3px rgba(236, 72, 153, 0.4)';
      
      setTimeout(() => {
        licenseInput.style.borderColor = '';
        licenseInput.style.boxShadow = '';
      }, 1500);
    }
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

  // Scrapes the client details and job text from the page using advanced heuristics
  function processPage() {
    try {
      // 1. Check if we are on a job details page/panel
      const titleEl = document.querySelector('[data-qa="job-title"]') || 
                    document.querySelector('.fe-job-details-header h1') || 
                    document.querySelector('.job-details-header h1') || 
                    document.querySelector('.job-details-panel h1') ||
                    document.querySelector('.slider-panel h1') ||
                    document.querySelector('.air3-card h1') ||
                    document.querySelector('h1');
                    
    const descEl = document.querySelector('[data-test="job-description"]') || 
                   document.querySelector('.fe-job-details-description') || 
                   document.querySelector('.job-description') ||
                   document.querySelector('[itemprop="description"]') ||
                   document.querySelector('.up-line-clamp') ||
                   document.querySelector('.break-word');

    if (!titleEl || !descEl) {
      console.log('BidIQ: Not a job details page or elements not loaded yet.');
      return;
    }

    ensurePanelInjected();

    // 2. Scrape job details
    const title = titleEl.textContent.trim();
    const description = descEl.textContent.trim();

    // 3. Scrape Client Metrics using flexible heuristics (regular expressions & DOM parsing)
    const clientText = getClientSectionText() || document.body.innerText;
    
    // Check if the client stats section is rendered in the DOM yet
    const isClientLoaded = clientText.toLowerCase().includes('about the client') || 
                           clientText.toLowerCase().includes('payment method') || 
                           clientText.toLowerCase().includes('jobs posted') ||
                           clientText.toLowerCase().includes('hire rate') ||
                           clientText.toLowerCase().includes('unverified') ||
                           clientText.toLowerCase().includes('verified');

    if (!isClientLoaded) {
      console.log('BidIQ: Client details block not loaded yet, retrying...');
      return; // Return early without setting pageScrapedSuccessfully to keep retrying
    }
    
    // Scrape Hire Rate (e.g., "75% hire rate")
    let hireRate = null;
    const hireRateMatch = clientText.match(/(\d+)%\s*(?:hire\s+rate|hiring\s+rate|hires)/i) || 
                          clientText.match(/(?:hire\s+rate|hiring\s+rate):\s*(\d+)%/i);
    if (hireRateMatch) {
      hireRate = parseInt(hireRateMatch[1], 10);
    } else {
      const el = document.querySelector('[data-test="hire-rate"]') || 
                 document.querySelector('[data-qa="client-hire-rate"]') ||
                 document.querySelector('[data-test="client-stats"]');
      if (el) {
        const m = el.innerText.match(/(\d+)%/);
        if (m) hireRate = parseInt(m[1], 10);
      }
    }

    // Scrape Average Pay Rate (e.g., "$25.00/hr avg hourly rate paid" or "$25.50 average hourly rate paid")
    let avgPayRate = null;
    const payRateMatch = clientText.match(/\$(\d+(?:\.\d+)?)\/hr\s*(?:avg|average)/i) || 
                         clientText.match(/\$(\d+(?:\.\d+)?)\s*(?:average|avg)\s*hourly/i) ||
                         clientText.match(/average\s*hourly\s*rate:\s*\$(\d+(?:\.\d+)?)/i) ||
                         clientText.match(/\$(\d+(?:\.\d+)?)\/hr/i);
    if (payRateMatch) {
      avgPayRate = parseFloat(payRateMatch[1]);
    } else {
      const el = document.querySelector('[data-test="avg-hourly-rate"]') || 
                 document.querySelector('[data-qa="client-hourly-rate"]');
      if (el) {
        const m = el.innerText.match(/\$(\d+(?:\.\d+)?)/);
        if (m) avgPayRate = parseFloat(m[1]);
      }
    }

    // Scrape Total Spend (e.g. "$100k+ total spend", "$500+ spent")
    let totalSpend = null;
    const spendMatch = clientText.match(/\$(\d+(?:\.\d+)?(?:k|m|b)?\+?)\s*(?:total\s*spend|spent|spend)/i) ||
                       clientText.match(/(?:total\s*spend|spent):\s*\$(\d+(?:\.\d+)?(?:k|m|b)?\+?)/i);
    if (spendMatch) {
      totalSpend = spendMatch[1];
    } else {
      const el = document.querySelector('[data-test="client-spend"]') || 
                 document.querySelector('[data-qa="client-spend"]');
      if (el) {
        totalSpend = el.innerText.replace(/(total spend|spent|spend)/gi, '').trim();
      }
    }

    // Scrape Client Star Rating (e.g. "4.89 of 5 stars", "4.9 stars")
    let rating = null;
    const ratingMatch = clientText.match(/(\d\.\d\d?)\s*(?:of\s*5\s*stars|stars|rating)/i) ||
                        clientText.match(/(?:rating|score):\s*(\d\.\d\d?)/i);
    if (ratingMatch) {
      rating = parseFloat(ratingMatch[1]);
    } else {
      const el = document.querySelector('[data-test="client-rating"]') || 
                 document.querySelector('.air3-rating') ||
                 document.querySelector('.fe-client-rating');
      if (el) {
        const m = el.innerText.match(/(\d\.\d\d?)/);
        if (m) rating = parseFloat(m[1]);
      }
    }

    // Payment Verification Status
    const isPaymentVerified = clientText.toLowerCase().includes('payment verified') || 
                              clientText.toLowerCase().includes('payment method verified') ||
                              !!document.querySelector('[data-qa="payment-verified"]') ||
                              !!document.querySelector('.payment-verified') ||
                              !!document.querySelector('.air3-icon-verified') ||
                              clientText.toLowerCase().includes('verified payment');

    // Scrape Client Country/Location
    let location = 'Unknown Location';
    const locEl = document.querySelector('[data-qa="client-location"]') || 
                  document.querySelector('[data-test="client-country"]') ||
                  document.querySelector('.fe-client-location');
    if (locEl) {
      location = locEl.textContent.trim().replace(/^(location|client's location):?/i, '').trim();
    } else {
      const locMatch = clientText.match(/client's\s*local\s*time.*?in\s*([a-zA-Z\s,]+)/i);
      if (locMatch) {
        location = locMatch[1].trim();
      }
    }

    scrapedData = {
      title,
      description,
      client: {
        circle: null,
        hireRate,
        avgPayRate,
        totalSpend: totalSpend || 'N/A',
        rating: rating || null,
        paymentVerified: isPaymentVerified,
        location
      }
    };

    console.log('BidIQ Advanced Scraped Data:', scrapedData);

    // 4. Update UI with scraped data
    updateUI(scrapedData.client);

    // Also update scraped freelancer info badges in real-time
    const scraped = parseFreelancerBaseline();
    const sidebarTitle = shadowRoot.getElementById('sidebar-scraped-title');
    const sidebarRate = shadowRoot.getElementById('sidebar-scraped-rate');
    if (sidebarTitle) sidebarTitle.textContent = scraped.profileTitle || 'Not Found';
    if (sidebarRate) sidebarRate.textContent = scraped.rate || 'Not Found';

    // Track analyzed job in stats
    chrome.runtime.sendMessage({ action: 'UPDATE_STATS', type: 'analyzed' });

    // Mark page as successfully scraped to stop retry polling loop
    pageScrapedSuccessfully = true;

    } catch (error) {
      console.error('BidIQ content script error during processPage:', error);
    }
  }

  // Update the Risk Assessor card components dynamically
  function updateUI(client) {
    if (!shadowRoot) return;

    const valHireRate = shadowRoot.getElementById('val-hire-rate');
    const valPayRate = shadowRoot.getElementById('val-pay-rate');
    const valTotalSpend = shadowRoot.getElementById('val-total-spend');
    const valRating = shadowRoot.getElementById('val-rating');
    const valLocation = shadowRoot.getElementById('val-client-location');
    const valPaymentStatus = shadowRoot.getElementById('val-payment-status');
    
    const cardHireRate = shadowRoot.getElementById('card-hire-rate');
    const cardPayRate = shadowRoot.getElementById('card-pay-rate');
    const cardSpend = shadowRoot.getElementById('card-total-spend');
    const cardRating = shadowRoot.getElementById('card-rating');
    
    const valRiskLevel = shadowRoot.getElementById('val-risk-level');
    const valRiskFactors = shadowRoot.getElementById('val-risk-factors');
    const toneLockBadge = shadowRoot.getElementById('tone-lock-badge');

    // Safety check: ensure all card elements exist before styling them
    if (!cardHireRate || !cardPayRate || !cardSpend || !cardRating || !valRiskFactors) {
      console.warn('BidIQ: Sidebar UI components not fully ready inside shadow DOM yet.');
      return;
    }

    // Reset card highlight classes
    [cardHireRate, cardPayRate, cardSpend, cardRating].forEach(card => {
      card.className = 'risk-stat-card';
    });
    valRiskFactors.innerHTML = '';

    const factors = [];

    // Check license locally to toggle lock visibility in the side panel
    chrome.storage.local.get(['licenseKey', 'instanceId'], (settings) => {
      const isPremium = settings.licenseKey && (settings.licenseKey.trim().toUpperCase().startsWith('BIDIQ-PREM-') || settings.instanceId);
      if (isPremium) {
        toneLockBadge.style.display = 'none';
      } else {
        toneLockBadge.style.display = 'inline';
      }
    });

    // 1. Process Hire Rate
    if (client.hireRate !== null) {
      valHireRate.textContent = `${client.hireRate}%`;
      if (client.hireRate >= 70) {
        cardHireRate.classList.add('emerald');
      } else if (client.hireRate >= 45) {
        cardHireRate.classList.add('amber');
        factors.push({ type: 'warning', text: `Moderate Hire Rate (${client.hireRate}%) - client is selective.` });
      } else {
        cardHireRate.classList.add('rose');
        factors.push({ type: 'danger', text: `Low Hire Rate (${client.hireRate}%) - client posts but rarely hires.` });
      }
    } else {
      valHireRate.textContent = 'N/A';
      factors.push({ type: 'warning', text: 'No hire rate history available (New client or private post).' });
    }

    // 2. Process Pay Rate
    if (client.avgPayRate !== null) {
      valPayRate.textContent = `$${client.avgPayRate.toFixed(2)}`;
      if (client.avgPayRate >= 30) {
        cardPayRate.classList.add('emerald');
      } else if (client.avgPayRate >= 15) {
        cardPayRate.classList.add('amber');
      } else {
        cardPayRate.classList.add('rose');
        factors.push({ type: 'warning', text: `Low Average Pay Rate ($${client.avgPayRate.toFixed(2)}/hr) - budget-conscious history.` });
      }
    } else {
      valPayRate.textContent = 'N/A';
    }

    // 3. Process Total Spend
    valTotalSpend.textContent = client.totalSpend;
    if (client.totalSpend !== 'N/A' && client.totalSpend !== '$0') {
      const spendNumber = parseFloat(client.totalSpend.replace(/[^0-9.]/g, ''));
      const isThousand = client.totalSpend.toLowerCase().includes('k');
      const isMillion = client.totalSpend.toLowerCase().includes('m');
      
      let estimatedVal = spendNumber;
      if (isThousand) estimatedVal *= 1000;
      if (isMillion) estimatedVal *= 1000000;

      if (estimatedVal >= 10000) {
        cardSpend.classList.add('emerald');
      } else if (estimatedVal >= 1000) {
        cardSpend.classList.add('amber');
      } else {
        cardSpend.classList.add('rose');
        factors.push({ type: 'warning', text: `Low Total Spend History (${client.totalSpend}) - client is relatively new/small spend.` });
      }
    } else {
      cardSpend.classList.add('rose');
      factors.push({ type: 'warning', text: 'No project spending history on Upwork yet.' });
    }

    // 4. Process Rating
    if (client.rating !== null) {
      valRating.textContent = client.rating.toFixed(1);
      if (client.rating >= 4.7) {
        cardRating.classList.add('emerald');
      } else if (client.rating >= 4.0) {
        cardRating.classList.add('amber');
        factors.push({ type: 'warning', text: `Average Client Rating is ${client.rating.toFixed(2)} - check previous freelancer feedback.` });
      } else {
        cardRating.classList.add('rose');
        factors.push({ type: 'danger', text: `Bad Client Rating (${client.rating.toFixed(2)}) - high risk of poor feedback/disputes.` });
      }
    } else {
      valRating.textContent = 'N/A';
    }

    // 5. Update Location & Payment Verification Status
    valLocation.textContent = `📍 ${client.location}`;
    
    if (client.paymentVerified) {
      valPaymentStatus.textContent = '💳 Verified';
      valPaymentStatus.style.color = '#10b981';
    } else {
      valPaymentStatus.textContent = '💳 Unverified';
      valPaymentStatus.style.color = '#ef4444';
      factors.push({ type: 'danger', text: 'Payment Method Unverified - high risk of invoice suspension.' });
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

  function loadSidebarSettings() {
    chrome.storage.local.get(['licenseKey', 'userProfile', 'instanceId'], (settings) => {
      const licenseInput = shadowRoot.getElementById('sidebar-license-key');
      const profileTextarea = shadowRoot.getElementById('sidebar-user-profile');
      
      if (licenseInput) {
        licenseInput.value = settings.licenseKey || '';
      }
      if (profileTextarea) {
        profileTextarea.value = settings.userProfile || '';
      }
      
      updateSidebarLicenseUI(settings.licenseKey, settings.instanceId);

      // Dynamically scrape and update the freelancer info badges
      const scraped = parseFreelancerBaseline();
      const sidebarTitle = shadowRoot.getElementById('sidebar-scraped-title');
      const sidebarRate = shadowRoot.getElementById('sidebar-scraped-rate');

      if (sidebarTitle) {
        sidebarTitle.textContent = scraped.profileTitle || 'Not Found';
      }
      if (sidebarRate) {
        sidebarRate.textContent = scraped.rate || 'Not Found';
      }
    });
  }

  function updateSidebarLicenseUI(key, instanceId) {
    const badge = shadowRoot.getElementById('sidebar-license-badge');
    const upgradeWrapper = shadowRoot.getElementById('sidebar-upgrade-btn-wrapper');
    const isPremium = key && (key.trim().toUpperCase().startsWith('BIDIQ-PREM-') || instanceId);

    if (badge) {
      if (isPremium) {
        badge.textContent = 'Premium Active';
        badge.style.color = '#10b981'; // Emerald
        if (upgradeWrapper) upgradeWrapper.style.display = 'none';
      } else {
        badge.textContent = 'Free Tier (3/day)';
        badge.style.color = '#94a3b8'; // Slate
        if (upgradeWrapper) upgradeWrapper.style.display = 'block';
      }
    }
  }

  async function verifySidebarLicenseKey(key) {
    const badge = shadowRoot.getElementById('sidebar-license-badge');
    if (!key) {
      chrome.storage.local.set({ licenseKey: '', instanceId: '' });
      updateSidebarLicenseUI('', '');
      return;
    }

    if (badge) {
      badge.textContent = 'Verifying...';
      badge.style.color = '#fb923c';
    }

    chrome.storage.local.get(['clientUid', 'instanceId'], async (store) => {
      const backendUrl = 'https://bidiq-o52g.onrender.com';
      try {
        const verifyUrl = `${backendUrl}/api/verify-license`;
        const response = await fetch(verifyUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ licenseKey: key, clientUid: store.clientUid, instanceId: store.instanceId })
        });

        const data = await response.json();
        if (response.ok && data.valid) {
          chrome.storage.local.set({ 
            licenseKey: key, 
            instanceId: data.instanceId || '' 
          });
          updateSidebarLicenseUI(key, data.instanceId);
          
          // Hide locks in main proposal view immediately
          const toneLockBadge = shadowRoot.getElementById('tone-lock-badge');
          if (toneLockBadge) toneLockBadge.style.display = 'none';
        } else {
          chrome.storage.local.set({ licenseKey: '', instanceId: '' });
          updateSidebarLicenseUI('', '');
          if (badge) {
            badge.textContent = data.message || 'Invalid key.';
            badge.style.color = '#ef4444';
          }
        }
      } catch (e) {
        console.warn('Sidebar validation failed, checking offline fallback:', e);
        if (key.trim().toUpperCase().startsWith('BIDIQ-PREM-')) {
          chrome.storage.local.set({ licenseKey: key, instanceId: '' });
          updateSidebarLicenseUI(key, '');
          const toneLockBadge = shadowRoot.getElementById('tone-lock-badge');
          if (toneLockBadge) toneLockBadge.style.display = 'none';
        } else {
          chrome.storage.local.set({ licenseKey: '', instanceId: '' });
          updateSidebarLicenseUI('', '');
          if (badge) {
            badge.textContent = 'Connection failed.';
            badge.style.color = '#ef4444';
          }
        }
      }
    });
  }

  // Start initialization
  init();
})();
