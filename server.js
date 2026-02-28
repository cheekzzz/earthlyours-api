const express = require("express");
const cors = require("cors");
const https = require("https");
const crypto = require("crypto");

const app = express();

app.use(cors());
app.use(express.json());

app.get("/", (req, res) => {
  res.send("API is running");
});

const API_KEY = process.env.MAILCHIMP_API_KEY;
const LIST_ID = process.env.MAILCHIMP_AUDIENCE_ID;

if (!API_KEY || !LIST_ID) {
  console.error("Missing Mailchimp environment variables");
  process.exit(1);
}

// Validate API key format
if (!API_KEY.includes("-")) {
  console.error("Invalid Mailchimp API key format");
  process.exit(1);
}

const SERVER = API_KEY.split("-")[1];
console.log("Using server:", SERVER);

function validateEmail(email) {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(email);
}

function getMD5Hash(email) {
  return crypto.createHash("md5").update(email.toLowerCase()).digest("hex");
}

function makeMailchimpRequest(url, options, data) {
  return new Promise((resolve, reject) => {
    const req = https.request(url, options, (res) => {
      let responseData = "";

      res.on("data", (chunk) => {
        responseData += chunk;
      });

      res.on("end", () => {
        try {
          const result = responseData ? JSON.parse(responseData) : {};
          resolve({ status: res.statusCode, data: result });
        } catch (err) {
          reject(new Error(`Failed to parse response: ${err.message}`));
        }
      });
    });

    req.setTimeout(10000, () => {
      req.destroy();
      reject(new Error("Request timeout after 10 seconds"));
    });

    req.on("error", (err) => {
      reject(err);
    });

    if (data) {
      req.write(JSON.stringify(data));
    }
    req.end();
  });
}

app.put("/subscribe", async (req, res) => {
  console.log("API HIT");

  const { email, weakArea } = req.body;

  console.log("Received subscription request:", { email, weakArea });

  if (!email || !validateEmail(email)) {
    console.log("Invalid email provided:", email);
    return res.status(400).json({ success: false, error: "Invalid email address" });
  }

  const emailHash = getMD5Hash(email);
  const url = `https://${SERVER}.api.mailchimp.com/3.0/lists/${LIST_ID}/members/${emailHash}`;

  const data = {
    email_address: email,
    status: "subscribed",
    merge_fields: {
      WEAK: weakArea
    }
  };

  const auth = Buffer.from(`anystring:${API_KEY}`).toString("base64");

  const options = {
    method: "PUT",
    headers: {
      Authorization: `Basic ${auth}`,
      "Content-Type": "application/json",
      "User-Agent": "eco-kitchen-quiz/1.0"
    }
  };

  try {
    console.log("Sending request to Mailchimp for", email);
    const response = await makeMailchimpRequest(url, options, data);

    if (response.status >= 400) {
      console.error("MAILCHIMP ERROR:", response.status, response.data);
      return res
        .status(response.status)
        .json({ success: false, error: response.data.detail || response.data.title || "Mailchimp error" });
    }

    console.log("Successfully subscribed/updated:", email);
    res.json({ success: true, message: "Subscribed successfully" });
  } catch (err) {
    console.error("Server error while subscribing:", err);
    res.status(500).json({ success: false, error: "Server error: " + err.message });
  }
});

const PORT = process.env.PORT || 5000;

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
