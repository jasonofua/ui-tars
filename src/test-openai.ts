import OpenAI from 'openai';
import dotenv from 'dotenv';

dotenv.config({ path: './src/.env' });

async function testOpenAI() {
    const openai = new OpenAI({
        apiKey: process.env.OPENAI_API_KEY
    });

    try {
        const result = await openai.chat.completions.create({
            model: "gpt-4o",
            messages: [
                { role: "user", content: "Hello!" }
            ]
        });
        console.log("Success!", result.choices[0].message);
    } catch (error) {
        console.error("Error:", error);
    }
}

testOpenAI(); 