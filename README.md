# BidIQ - Upwork Freelancer Companion 🚀

BidIQ is a premium, client-side Chrome Extension accompanied by a secure API backend helper, designed to help Upwork freelancers save money on bidding Connects and draft winning proposals in seconds.

## 📁 Repository Structure
*   **`extension/`**: Chrome Extension content scripts, manifest V3, popup UI settings, and styling.
*   **`backend/`**: Secure Express.js API backend running Google Gemini 1.5 Flash to generate cover letters and bypass client-side API credential exposures.

---

## 🛠️ Setup & Local Installation

### 1. Start the API Backend
1. Navigate to the `backend/` directory.
2. Create a `.env` file with your Gemini API key:
   ```env
   GEMINI_API_KEY=your_gemini_api_key_here
   PORT=3001
   ```
3. Install dependencies and start the server:
   ```bash
   npm install
   npm start
   ```
   The backend will start listening at `http://localhost:3001`.

### 2. Load the Extension in Chrome
1. Open Google Chrome and navigate to `chrome://extensions/`.
2. Toggle the **Developer mode** switch in the top-right corner.
3. Click the **Load unpacked** button in the top-left corner.
4. Select the **`extension/`** folder from this repository.
5. BidIQ will appear in your active extensions. Click the puzzle icon to pin it!

---

## 📈 Features
*   **Client Risk Analysis**: Displays client’s hire rate, payment verification status, and historical average pay rate directly on the job page.
*   **Smart Proposal Generator**: One-click AI proposal drafts tailored to the specific job description, custom tone, and delivery focus parameters.
*   **Secure API Architecture**: Runs proposal generation on your backend server to keep API keys safe.
