import dotenv from 'dotenv';
import { exec } from 'child_process';

dotenv.config({ path: './src/.env' });

function listModels() {
    const apiKey = process.env.OPENAI_API_KEY;
    console.log('API Key:', apiKey?.slice(0, 10) + '...');

    const curlCommand = `curl https://api.openai.com/v1/models \
        -H "Authorization: Bearer ${apiKey}" \
        -H "Content-Type: application/json"`;

    exec(curlCommand, (error, stdout, stderr) => {
        if (error) {
            console.error('Error:', error);
            return;
        }
        if (stderr) {
            console.error('Stderr:', stderr);
            return;
        }

        // Pretty print the JSON response
        const models = JSON.parse(stdout);
        console.log('\nAvailable Models:');
        models.data.forEach((model: { id: string }) => {
            console.log(`- ${model.id}`);
        });
    });
}

listModels(); 