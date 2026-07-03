const express = require('express');
const cors = require('cors');
const dotenv = require('dotenv');
const fs = require('fs');
const path = require('path');

// Load environment variables
dotenv.config();

const app = express();
const port = process.env.PORT || 3001;
const usageFilePath = path.join(__dirname, 'usage.json');

// Middlewares
app.use(cors());
app.use(express.json());

// Log incoming requests
app.use((req, res, next) => {
  console.log(`[${new Date().toISOString()}] ${req.method} ${req.path}`);
  next();
});

// Helper to check and verify/activate license with Lemon Squeezy API
async function verifyOrActivateLicense(licenseKey, clientUid, instanceId) {
  const apiKey = process.env.LEMON_SQUEEZY_API_KEY;
  if (!apiKey) {
    throw new Error('Lemon Squeezy API Key is not configured on the backend server.');
  }

  // 1. If we have an existing instanceId, try to VALIDATE it (does not count towards activation limits)
  if (instanceId) {
    try {
      console.log(`[lemon-squeezy] Attempting validation for instanceId: ${instanceId}`);
      const response = await fetch('https://api.lemonsqueezy.com/v1/licenses/validate', {
        method: 'POST',
        headers: {
          'Accept': 'application/vnd.api+json',
          'Content-Type': 'application/vnd.api+json',
          'Authorization': `Bearer ${apiKey}`
        },
        body: JSON.stringify({
          license_key: licenseKey,
          instance_id: instanceId
        })
      });

      const data = await response.json();
      console.log('[lemon-squeezy] Validate API response:', data);

      if (response.ok && data.valid === true) {
        return {
          valid: true,
          instanceId: instanceId,
          message: 'License verified successfully.'
        };
      }
    } catch (err) {
      console.warn('[lemon-squeezy] Validate API call failed, falling back to Activate:', err);
    }
  }

  // 2. If no instanceId or validation failed, call ACTIVATE to register a new instance slot
  try {
    console.log(`[lemon-squeezy] Attempting activation for clientUid: ${clientUid}`);
    const response = await fetch('https://api.lemonsqueezy.com/v1/licenses/activate', {
      method: 'POST',
      headers: {
        'Accept': 'application/vnd.api+json',
        'Content-Type': 'application/vnd.api+json',
        'Authorization': `Bearer ${apiKey}`
      },
      body: JSON.stringify({
        license_key: licenseKey,
        instance_name: clientUid || 'BidIQ Extension'
      })
    });

    const data = await response.json();
    console.log('[lemon-squeezy] Activate API response:', data);

    if (response.ok && data.activated === true) {
      return {
        valid: true,
        instanceId: data.instance?.id || null,
        message: 'License activated successfully.'
      };
    } else {
      return {
        valid: false,
        instanceId: null,
        message: data.error || 'Invalid license key.'
      };
    }
  } catch (err) {
    console.error('[lemon-squeezy] API connection failed:', err);
    throw err;
  }
}

// Helper to check and update daily usage count for free users
function checkAndUpdateUsage(clientUid) {
  if (!clientUid) {
    return { allowed: false, count: 0 };
  }

  let usageData = {};
  try {
    if (fs.existsSync(usageFilePath)) {
      usageData = JSON.parse(fs.readFileSync(usageFilePath, 'utf8'));
    }
  } catch (e) {
    console.error('Error reading usage.json:', e);
  }

  const today = new Date().toISOString().split('T')[0]; // YYYY-MM-DD

  if (!usageData[clientUid]) {
    usageData[clientUid] = { date: today, count: 0 };
  }

  const clientRecord = usageData[clientUid];
  
  // Reset count if it's a new day
  if (clientRecord.date !== today) {
    clientRecord.date = today;
    clientRecord.count = 0;
  }

  // Enforce 3 free proposals per day
  if (clientRecord.count >= 3) {
    return { allowed: false, count: clientRecord.count };
  }

  clientRecord.count += 1;

  try {
    fs.writeFileSync(usageFilePath, JSON.stringify(usageData, null, 2), 'utf8');
  } catch (e) {
    console.error('Error writing usage.json:', e);
  }

  return { allowed: true, count: clientRecord.count };
}

// Health check endpoint
app.get('/api/health', (req, res) => {
  res.status(200).json({
    status: 'ok',
    message: 'BidIQ Backend is active.'
  });
});

// License verification endpoint
app.post('/api/verify-license', async (req, res) => {
  const { licenseKey, clientUid, instanceId } = req.body;
  
  if (!licenseKey) {
    return res.status(400).json({ valid: false, message: 'License key is required.' });
  }

  // 1. Check Mock Premium Keys (for testing and offline compatibility)
  if (licenseKey.trim().toUpperCase().startsWith('BIDIQ-PREM-')) {
    return res.status(200).json({
      valid: true,
      tier: 'premium',
      message: 'License verified successfully (Mock Bypass).'
    });
  }

  // 2. Perform live Lemon Squeezy API Verification (Validate first, then Activate)
  try {
    const result = await verifyOrActivateLicense(licenseKey, clientUid, instanceId);
    if (result.valid) {
      return res.status(200).json({
        valid: true,
        tier: 'premium',
        instanceId: result.instanceId,
        message: result.message
      });
    } else {
      return res.status(400).json({
        valid: false,
        tier: 'free',
        message: result.message
      });
    }
  } catch (e) {
    return res.status(500).json({
      valid: false,
      tier: 'free',
      message: 'Failed to connect to Lemon Squeezy validation servers.'
    });
  }
});

// Proposal generation endpoint
app.post('/api/generate-proposal', async (req, res) => {
  try {
    const { 
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
    } = req.body;

    console.log(`[proposal-gen] clientUid="${clientUid}" licenseKey="${licenseKey}" instanceId="${instanceId}"`);

    if (!jobDescription) {
      return res.status(400).json({ error: 'Job description is required.' });
    }

    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      return res.status(500).json({ error: 'Gemini API key is not configured on the backend.' });
    }

    // 1. License Check & Usage Limits
    let isPremium = false;
    let newInstanceId = instanceId || null;

    if (licenseKey) {
      if (licenseKey.trim().toUpperCase().startsWith('BIDIQ-PREM-')) {
        isPremium = true;
      } else {
        // Try live verification
        try {
          const verifyResult = await verifyOrActivateLicense(licenseKey, clientUid, instanceId);
          if (verifyResult.valid) {
            isPremium = true;
            newInstanceId = verifyResult.instanceId;
          }
        } catch (e) {
          console.warn('[proposal-gen] live license verification failed, evaluating offline fallback rules:', e);
        }
      }
    }

    let usageResult = { allowed: true, count: 0 };

    if (!isPremium) {
      // Enforce limits on free users
      usageResult = checkAndUpdateUsage(clientUid);
      if (!usageResult.allowed) {
        return res.status(429).json({ 
          error: 'Daily free proposal limit reached (3/day). Please enter a valid Premium License Key in settings to unlock unlimited generation.' 
        });
      }
    }

    // 2. Build the AI Prompt with Freelancer Profile Context (Hybrid Scraping + Settings)
    const prompt = `
You are an elite, top-rated Upwork freelancer specializing in high-ticket project delivery. 
You are writing a customized proposal/cover letter for the following Upwork job:

JOB TITLE: ${jobTitle || 'Freelance Project'}
JOB DESCRIPTION:
${jobDescription}

CLIENT HISTORICAL INFO:
- Avg Pay Rate: ${clientMetrics?.avgPayRate ? `$${clientMetrics.avgPayRate}/hr` : 'N/A'}
- Hire Rate: ${clientMetrics?.hireRate ? `${clientMetrics.hireRate}%` : 'N/A'}
- Payment Verified: ${clientMetrics?.paymentVerified ? 'Yes' : 'No'}

FREELANCER PROFILE CONTEXT (Use this to customize your experience in the proposal):
- Scraped baseline rate on page: ${freelancerScrapedInfo?.rate || 'N/A'}
- Scraped baseline title on page: ${freelancerScrapedInfo?.profileTitle || 'N/A'}
- Saved custom project highlights/portfolio context: 
${userProfile ? userProfile : 'Not specified.'}

PROPOSAL SETTINGS:
- Tone: ${tone} (conversational = friendly/direct, professional = expert/structured, technical = developer/solution-focused)
- Strategic Focus: ${focus} (quality = high value & premium execution, speed = quick delivery, cost = value-engineered & efficient)

CRITICAL RULES FOR COVR LETTER WRITING:
1. DO NOT use generic greetings like "Dear Hiring Manager", "Dear Client", "Greetings", or "I hope this email finds you well". Start directly with a hook.
2. DO NOT write standard, boring introductions like "I am writing to express my interest in..." or "I see you need a developer...".
3. START IMMEDIATELY with a strong 1-2 sentence hook. Ask a smart, highly relevant technical/strategic question about their project, or point out a hidden trap they should avoid.
4. ALIGN TO FREELANCER BACKGROUND: Integrate details, portfolio links, and relevant skills from the Freelancer Profile Context section. Show how the freelancer's specific experience maps perfectly to their requirements.
5. DEMONSTRATE UNDERSTANDING: Briefly describe the core challenge of their project in your own words, showing you understand the pain point.
6. PROPOSE THE SOLUTION: Outline a clear 2-3 step high-level approach/milestones of how you will execute this job.
7. SHOW VALUE based on the focus setting:
   - If focus is 'quality', emphasize pristine code, scalability, and robust architecture.
   - If focus is 'speed', emphasize rapid turnarounds, agile feedback, and fast milestones.
   - If focus is 'cost', emphasize ROI, utilizing cost-effective SaaS integrations, and efficient scoping.
8. CALL TO ACTION (CTA): End with a brief, low-friction CTA (e.g. "Let's hop on a quick 5-minute call to align on X?", "Would you like me to share a quick mock design for Z?").
9. Keep the cover letter extremely clean, short (250-350 words max), and divided into readable paragraphs or bullet points. Avoid walls of text.

Write the Upwork proposal cover letter now:
`;

    // 3. Fetch call to Google Gemini 2.5 Flash API
    const geminiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`;
    
    const response = await fetch(geminiUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        contents: [
          {
            parts: [
              {
                text: prompt
              }
            ]
          }
        ]
      })
    });

    if (!response.ok) {
      const errBody = await response.text();
      console.error('Gemini API Error Response:', errBody);
      throw new Error(`Gemini API returned status ${response.status}`);
    }

    const data = await response.json();
    const proposalText = data.candidates?.[0]?.content?.parts?.[0]?.text || '';

    if (!proposalText) {
      throw new Error('Gemini API returned empty response content.');
    }

    res.status(200).json({ 
      proposal: proposalText.trim(),
      usageCount: usageResult.count,
      isPremium,
      instanceId: newInstanceId
    });
  } catch (error) {
    console.error('Proposal generation API error:', error);
    res.status(500).json({ error: error.message || 'Failed to generate proposal.' });
  }
});

// Start the server
app.listen(port, () => {
  console.log(`==================================================`);
  console.log(`🚀 BidIQ Backend running on port: ${port}`);
  console.log(`🚀 Health Check: http://localhost:${port}/api/health`);
  console.log(`==================================================`);
});
