import { exec } from 'child_process';
import cors from 'cors';
import dotenv from 'dotenv';
import voice from 'elevenlabs-node';
import express from 'express';
import { promises as fs } from 'fs';
import OpenAI from 'openai';
import multer from 'multer';
dotenv.config();

// Set up multer for file handling
const upload = multer({ storage: multer.memoryStorage() });

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY || '-',
});

const elevenLabsApiKey = process.env.ELEVEN_LABS_API_KEY;
const voiceID = 'EXAVITQu4vr4xnSDxMaL';

const app = express();
app.use(express.json());
app.use(cors());
const port = 3000;

const genAvatarDetails = async (userMessage, i) => {
  const availableAnimations = ['Talking_0', 'Talking_2', 'Talking_1'];

  const message = {};
  // Generate audio file
  const fileName = `audios/message_${i}.mp3`;
  await voice.textToSpeech(elevenLabsApiKey, voiceID, fileName, userMessage);

  // Generate lipsync
  await lipSyncMessage(i);
  message.audio = await audioFileToBase64(fileName);
  message.lipsync = await readJsonTranscript(`audios/message_${i}.json`);
  message.text = userMessage;
  message.animation = availableAnimations[i % availableAnimations.length];
  message.facialExpression = 'smile';

  return message;
};

app.get('/', (req, res) => {
  res.send('Hello World!');
});

app.post('/upload', async (req, res) => {
  const { assignment, submission } = req.body;

  if (!assignment || !submission) {
    res.status(400).send('No content was uploaded.');
    console.log('No content was uploaded.');
    return;
  }

  const initialPrompt = `question: ${assignment}\n answer: ${submission}`;

  try {
    const completion = await openai.chat.completions.create({
      model: 'gpt-4',
      max_tokens: 1000,
      temperature: 0.6,
      messages: [
        {
          role: 'system',
          content: `
          You are an expert educational assessor. Please:
1. Analyze the provided questions and answers ${initialPrompt}.
2. Create exactly 5 assessment questions from the inputs answers targeting:
   - Different cognitive levels (knowledge, comprehension, application, analysis, evaluation)
   - Relevance to the provided content, avoiding redundancy
   - A balance of theoretical and practical elements
          The output should be a JSON array in this format:
          [
            {"question": "Your question 1"},
            {"question": "Your question 2"},
            {"question": "Your question 3"},
            {"question": "Your question 4"},
            {"question": "Your question 5"}
          ]
          `,
        },
        {
          role: 'user',
          content: 'Hello',
        },
      ],
    });

    // Log the entire response to inspect its structure
    console.log(
      'Raw completion response:',
      JSON.stringify(completion, null, 2)
    );

    // Extract the content if it exists and remove code block formatting
    let responseContent = completion?.choices?.[0]?.message?.content;
    if (responseContent) {
      // Remove code block formatting if present
      responseContent = responseContent.replace(/```json|```/g, '').trim();

      // Attempt to parse JSON
      const questions = JSON.parse(responseContent);

      let count = 0;

      for (const question of questions) {
        console.log('Generated Question:', question.question);
        question.message = await genAvatarDetails(question.question, count);
        count++;
      }

      console.log('Generated Questions:', questions);
      res.status(200).json(questions);
    } else {
      console.error('No content generated in response');
      res.status(500).send('Error generating questions.');
    }
  } catch (error) {
    console.error(
      'Error in OpenAI API call:',
      error.response ? error.response.data : error.message
    );
    res.status(500).send('Error generating questions.');
  }
});

app.post('/result', async (req, res) => {
  const { assignment, submission, questions, answers } = req.body;

  if (!assignment || !submission || !answers) {
    res.status(400).send('No content was uploaded.');
    console.log('No content was uploaded.');
    return;
  }

  const initialPrompt = `Preset Questions: ${assignment}\n Expected Answers: ${submission}`;
  const studentAnswers = `Ai-generated Questions ${questions}\n Oral Answers: ${answers}`;

  try {
    const completion = await openai.chat.completions.create({
      model: 'gpt-4',
      max_tokens: 1000,
      temperature: 0.6,
      messages: [
        {
          role: 'system',
          content: `
          You are an expert educational assessor. Please:
1. Analyze the provided questions and answers ${initialPrompt} and ${studentAnswers}.
2. from the inputs, rank the student's answers based on the following criteria:
   - Different cognitive levels (knowledge, comprehension, application, analysis, evaluation)
   - Relevance to the provided content.
   - A balance of theoretical and practical elements
   - Give feedback on the student's answers
   - Give Score out of 10 for each answer based on (knowledge, comprehension, application, analysis, evaluation) also assess the answers and give score for each category.
          The output should be a JSON array in this format:
          {
            data:[
              {"answer": "Your answer 1", "score": 10, knowledge_score: 10, comprehensive_score: 10, application_score: 10, analysis_score: 10, evaluation_score: 10}, 
              {"answer": "Your answer 2", "score": 10, knowledge_score: 10, comprehensive_score: 10, application_score: 10, analysis_score: 10, evaluation_score: 10},
              {"answer": "Your answer 3", "score": 10, knowledge_score: 10, comprehensive_score: 10, application_score: 10, analysis_score: 10, evaluation_score: 10},
              {"answer": "Your answer 4", "score: 10, knowledge_score: 10, comprehensive_score: 10, application_score: 10, analysis_score: 10, evaluation_score: 10},
              {"answer": "Your answer 5", "score: 10, knowledge_score: 10, comprehensive_score: 10, application_score: 10, analysis_score: 10, evaluation_score: 10}
            ],
            overallScore: "40/50",
            overallFeedback: "Your feedback here"
          }
          `,
        },
      ],
    });

    // Log the entire response to inspect its structure
    console.log(
      'Raw completion response:',
      JSON.stringify(completion, null, 2)
    );

    // Extract the content if it exists and remove code block formatting
    let responseContent = completion?.choices?.[0]?.message?.content;
    if (responseContent) {
      // Remove code block formatting if present
      responseContent = responseContent.replace(/```json|```/g, '').trim();

      // Attempt to parse JSON
      const results = JSON.parse(responseContent);

      console.log('Generated Result:', results);
      res.status(200).json(results);
    } else {
      console.error('No content generated in response');
      res.status(500).send('Error generating results.');
    }
  } catch (error) {
    console.error(
      'Error in OpenAI API call:',
      error.response ? error.response.data : error.message
    );
    res.status(500).send('Error generating results.');
  }
});

app.get('/voices', async (req, res) => {
  res.send(await voice.getVoices(elevenLabsApiKey));
});

const execCommand = (command) => {
  return new Promise((resolve, reject) => {
    exec(command, (error, stdout, stderr) => {
      if (error) reject(error);
      resolve(stdout);
    });
  });
};

const lipSyncMessage = async (message) => {
  const time = new Date().getTime();
  console.log(`Starting conversion for message ${message}`);
  await execCommand(
    `ffmpeg -y -i audios/message_${message}.mp3 audios/message_${message}.wav`
    // -y to overwrite the file
  );
  console.log(`Conversion done in ${new Date().getTime() - time}ms`);
  await execCommand(
    `./bin/rhubarb -f json -o audios/message_${message}.json audios/message_${message}.wav -r phonetic`
  );
  // -r phonetic is faster but less accurate
  console.log(`Lip sync done in ${new Date().getTime() - time}ms`);
};

const readJsonTranscript = async (file) => {
  const data = await fs.readFile(file, 'utf8');
  return JSON.parse(data);
};

const audioFileToBase64 = async (file) => {
  const data = await fs.readFile(file);
  return data.toString('base64');
};

app.listen(port, () => {
  console.log(`Mary Ai is listening on port ${port}`);
});
