import { exec } from 'child_process';
import dotenv from 'dotenv';

dotenv.config({ path: './src/.env' });

const apiKey = process.env.OPENAI_API_KEY;

const curlCommand = `curl https://api.openai.com/v1/chat/completions \\
  -H "Content-Type: application/json" \\
  -H "Authorization: Bearer ${apiKey}" \\
  -d '{
    "model": "gpt-4o",
    "messages": [
      {"role": "system", "content": "You are a helpful assistant."},
      {"role": "user", "content": "Hello!"}
    ],
    "temperature": 0.7,
    "max_tokens": 1000
  }'`;

exec(curlCommand, (error, stdout, stderr) => {
    if (error) {
        console.error('Error:', error);
        return;
    }
    if (stderr) {
        console.error('Stderr:', stderr);
        return;
    }
    console.log('Response:', JSON.parse(stdout));
}); 