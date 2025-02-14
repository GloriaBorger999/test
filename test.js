const express = require("express");
const { BotFrameworkAdapter, ActivityTypes } = require("botbuilder");
const fileUpload = require("express-fileupload");
const pdfParse = require("pdf-parse");
const OpenAI = require("openai");
const bodyParser = require("body-parser");
const fs = require("fs");
const path = require("path");
const mammoth = require("mammoth");

const app = express();
const port = 5000;

// ✅ CORS Middleware
app.use((req, res, next) => {
    res.header("Access-Control-Allow-Origin", "*");
    res.header("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
    res.header("Access-Control-Allow-Headers", "Origin, X-Requested-With, Content-Type, Accept, Authorization");
    if (req.method === 'OPTIONS') {
        return res.sendStatus(200);
    }
    next();
});



// ✅ Error Handling Middleware
adapter.onTurnError = async (context, error) => {
    console.error(`[onTurnError] Unhandled error: ${error}`);
    await context.sendActivity("The bot encountered an error. Please try again later.");
};

// ✅ Middleware
app.use(bodyParser.json());
app.use(fileUpload());

// 📌 Storage Directory for Uploads
const UPLOAD_DIR = path.join(__dirname, "uploads");
if (!fs.existsSync(UPLOAD_DIR)) {
    fs.mkdirSync(UPLOAD_DIR);
}

// ✅ Main Bot Logic
class CVMatchingBot {
    async onTurn(context) {
        console.log(`Processing activity: ${context.activity.type}`);

        if (context.activity.type === ActivityTypes.ConversationUpdate) {
            if (context.activity.membersAdded?.length > 0) {
                for (const member of context.activity.membersAdded) {
                    if (member.id !== context.activity.recipient.id) {
                        await context.sendActivity('Welcome! Type "match cv with jd" to start the matching process.');
                    }
                }
            }
            return;
        }

        if (context.activity.type === ActivityTypes.Message) {
            const userMessage = context.activity.text.toLowerCase();
           
            if (userMessage.includes('match') && (userMessage.includes('cv') || userMessage.includes('jd'))) {
                await context.sendActivity("Please upload your CV and JD files using the API endpoint `/upload`.");
            } else {
                await context.sendActivity('Type "match cv with jd" to start the matching process.');
            }
        }
    }
}

// ✅ Helper Function: Extract Text from File
async function extractTextFromFile(filePath, fileType) {
    try {
        if (fileType === "pdf") {
            const data = await pdfParse(fs.readFileSync(filePath));
            return data.text;
        } else if (fileType === "docx") {
            const result = await mammoth.extractRawText({ path: filePath });
            return result.value;
        } else if (fileType === "txt") {
            return fs.readFileSync(filePath, "utf8");
        } else {
            throw new Error("Unsupported file format.");
        }
    } catch (error) {
        console.error("Error extracting text:", error);
        return "";
    }
}

app.get("/", (req,res) => {
    res.send("Express on Vercel")
})

// ✅ File Upload API
app.post("/upload", async (req, res) => {
    try {
        if (!req.files || !req.files.cv || !req.files.jd) {
            return res.status(400).json({ error: "Please upload both CV and JD files." });
        }

        const cvFile = req.files.cv;
        const jdFile = req.files.jd;

        const cvPath = path.join(UPLOAD_DIR, Date.now() + "_" + cvFile.name);
        const jdPath = path.join(UPLOAD_DIR, Date.now() + "_" + jdFile.name);

        await cvFile.mv(cvPath);
        await jdFile.mv(jdPath);

        const cvText = await extractTextFromFile(cvPath, cvFile.name.split('.').pop().toLowerCase());
        const jdText = await extractTextFromFile(jdPath, jdFile.name.split('.').pop().toLowerCase());

        if (!cvText || !jdText) {
            return res.status(400).json({ error: "Could not extract text from one or both files." });
        }

        // ✅ OpenAI Prompt
        const prompt = `
        Match the following CV to the job description and return a structured JSON response:
        - Job Description: ${jdText}
        - Candidate CV: ${cvText}

        Respond in this format:
        {
            "matchingScore": int,
            "keyMatchedSkills": [string],
            "missingSkills": [string],
            "summary": string,
            "finalRecommendation": string
        }
        `;

        const response = await openai.chat.completions.create({
            model: "gpt-4",
            messages: [{ role: "user", content: prompt }],
            temperature: 0.7,
        });

        const result = JSON.parse(response.choices[0].message.content);

        res.json({
            message: "Matching completed successfully!",
            score: result.matchingScore,
            matchedSkills: result.keyMatchedSkills,
            missingSkills: result.missingSkills,
            summary: result.summary,
            recommendation: result.finalRecommendation
        });

    } catch (error) {
        console.error("Error processing files:", error);
        res.status(500).json({ error: "Error processing the files." });
    }
});

// ✅ Bot Framework Endpoint
const bot = new CVMatchingBot();
app.post("/api/messages", async (req, res) => {
    try {
        await adapter.processActivity(req, res, async (context) => {
            await bot.onTurn(context);
        });
    } catch (error) {
        console.error("Error processing activity:", error);
        res.status(500).json({ error: error.message });
    }
});

// ✅ Start Server
app.listen(port, () => {
    console.log(`🚀 Server running on http://localhost:${port}`);
});
