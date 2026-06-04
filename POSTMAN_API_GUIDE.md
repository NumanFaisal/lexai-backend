# LexAI API Testing Guide (Postman)

This document provides all the necessary details to test the LexAI backend API endpoints using Postman or any other API client.

## 🔑 Prerequisites

1. **Start the Server:** Ensure your backend is running (`npm run dev` at `http://localhost:4000`).
2. **Authentication:** All AI routes are protected. You need a valid JWT token (e.g., from Clerk).
   - In Postman, go to the **Authorization** tab.
   - Select **Bearer Token**.
   - Paste your valid user token in the Token field.
3. **Headers:**
   - `Content-Type: application/json`

---

## 1️⃣ AI Research Mode
General legal research and Q&A with strict citation verification.

- **Method:** `POST`
- **URL:** `http://localhost:4000/api/v1/chat/research`
- **Body (raw JSON):**
```json
{
  "message": "What are the grounds for anticipatory bail under Section 438 of CrPC?",
  "model": "gemini-2.0-flash"
}
```

---

## 2️⃣ Case Analysis Mode (IRAC)
Deep legal analysis using the Issue-Rule-Application-Conclusion framework, backed by RAG.

- **Method:** `POST`
- **URL:** `http://localhost:4000/api/v1/chat/case-analysis`
- **Body (raw JSON):**
```json
{
  "message": "Analyze a situation where a tenant refuses to vacate a commercial property in Delhi after the lease has expired 6 months ago, and they haven't paid rent.",
  "model": "gemini-2.0-flash"
}
```

---

## 3️⃣ Compliance Mode
Generates a prioritized JSON checklist for business compliance.

- **Method:** `POST`
- **URL:** `http://localhost:4000/api/v1/chat/compliance`
- **Body (raw JSON):**
```json
{
  "businessType": "SaaS Startup",
  "state": "Karnataka",
  "headcount": 12,
  "revenueBracket": "₹20L-1Cr",
  "hasUserData": true,
  "isFood": false,
  "isFintech": false,
  "model": "gemini-2.0-flash"
}
```

---

## 4️⃣ Document Drafting Mode
Generates professional legal documents based on provided party details.

- **Method:** `POST`
- **URL:** `http://localhost:4000/api/v1/chat/drafting`
- **Body (raw JSON):**
```json
{
  "documentType": "Non-Disclosure Agreement (NDA)",
  "jurisdiction": "Courts at Bengaluru",
  "parties": [
    {
      "name": "Acme Technologies Pvt Ltd",
      "role": "Disclosing Party",
      "type": "Company"
    },
    {
      "name": "John Doe",
      "role": "Receiving Party",
      "type": "Individual"
    }
  ],
  "context": "This is for a potential M&A discussion. The confidentiality period should be 3 years.",
  "saveDocument": true,
  "model": "claude-3-5-sonnet"
}
```
*(Note: Because `saveDocument` is true, this will also auto-save it to your `documents` database table and return a `documentId`.)*

---

## 5️⃣ Fetch Chat History
Retrieves the user's past queries across all modes.

- **Method:** `GET`
- **URL:** `http://localhost:4000/api/v1/chat/history`

---

## 6️⃣ Fetch Conversations List
Retrieves paginated conversation threads.

- **Method:** `GET`
- **URL:** `http://localhost:4000/api/v1/chat/conversations?page=1&limit=20`

---

## 7️⃣ Fetch Single Conversation Details
Retrieves the full details and queries of a specific conversation thread.

- **Method:** `GET`
- **URL:** `http://localhost:4000/api/v1/chat/conversations/:id`
*(Replace `:id` with an actual conversation ID or query ID from the previous endpoints.)*

---

## 💡 How to Test Redis Caching
1. Send any `POST` request from above (e.g., Research or Case Analysis).
2. Look at the `latencyMs` in the response (it might take 5-10 seconds the first time).
3. Send the **exact same request** again.
4. The response should now be nearly instantaneous (`latencyMs` < 50ms) and the `fromCache` boolean in the response will be `true`.
