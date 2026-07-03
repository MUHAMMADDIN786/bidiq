const express = require('express');
const cors = require('cors');
const dotenv = require('dotenv');

// Load environment variables
dotenv.config();

const app = express();
const port = process.env.PORT || 3001;

// Middlewares
app.use(cors());
app.use(express.json());

// Log incoming requests
app.use((req, res, next) => {
  console.log(`[${new Date().toISOString()}] ${req.method} ${req.path}`);
  next();
});

// Health check endpoint
app.get('/api/health', (req, res) => {
  res.status(200).json({
    status: 'ok',
    message: 'BidIQ Backend is active.'
  });
});

// Proposal generation endpoint
app.post('/api/generate-proposal', async (req, res) => {
  try {
    const { jobTitle, jobDescription, clientMetrics, tone, focus } = req.body;

    if (!jobDescription) {
      return res.status(400).json({ error: 'Job description is required.' });
    }

    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      return res.status(500).json({ error: 'Gemini API key is not configured on the backend.' });
    }

    // Build the AI Prompt
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

PROPOSAL SETTINGS:
- Tone: ${tone} (conversational = friendly/direct, professional = expert/structured, technical = developer/solution-focused)
- Strategic Focus: ${focus} (quality = high value & premium execution, speed = quick delivery, cost = value-engineered & efficient)

CRITICAL RULES FOR COVR LETTER WRITING:
1. DO NOT use generic greetings like "Dear Hiring Manager", "Dear Client", "Greetings", or "I hope this email finds you well". Start directly with a hook.
2. DO NOT write standard, boring introductions like "I am writing to express my interest in..." or "I see you need a developer...".
3. START IMMEDIATELY with a strong 1-2 sentence hook. Ask a smart, highly relevant technical/strategic question about their project, or point out a hidden trap they should avoid.
4. DEMONSTRATE UNDERSTANDING: Briefly describe the core challenge of their project in your own words, showing you understand the pain point.
5. PROPOSE THE SOLUTION: Outline a clear 2-3 step high-level approach/milestones of how you will execute this job.
6. SHOW VALUE based on the focus setting:
   - If focus is 'quality', emphasize pristine code, scalability, and robust architecture.
   - If focus is 'speed', emphasize rapid turnarounds, agile feedback, and fast milestones.
   - If focus is 'cost', emphasize ROI, utilizing cost-effective SaaS integrations, and efficient scoping.
7. CALL TO ACTION (CTA): End with a brief, low-friction CTA (e.g. "Let's hop on a quick 5-minute call to align on X?", "Would you like me to share a quick mock design for Y?").
8. Keep the cover letter extremely clean, short (250-350 words max), and divided into readable paragraphs or bullet points. Avoid walls of text.

Write the Upwork proposal cover letter now:
`;

    // Fetch call to Google Gemini 2.5 Flash API
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

    res.status(200).json({ proposal: proposalText.trim() });
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
