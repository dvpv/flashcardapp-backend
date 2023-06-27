const functions = require("firebase-functions");
const logger = require("firebase-functions/logger");
const { GPTKEY } = require("./secrets.js");
const axios = require("axios");

exports.api = functions.https.onRequest(app);

exports.generate = functions.https.onCall(async (data, context) => {
  if (!context.auth) {
    throw new functions.https.HttpsError("unauthenticated", "Unauthorized");
  }

  const { payload } = data;

  try {
    const parsedPayload = JSON.parse(payload);
    if (!parsedPayload.text) {
      throw new functions.https.HttpsError(
        "invalid-argument",
        "Invalid payload format"
      );
    }
    logger.info(parsedPayload.text);

    return await callGPT(parsedPayload.text);
  } catch (error) {
    throw new functions.https.HttpsError(
      "invalid-argument",
      "Invalid payload format"
    );
  }
});

async function callGPT(text) {
  logger.info(`callGPT with text: ${text}`);
  const numberOfQuestions = 5;
  const query = `Give me ${numberOfQuestions} questions and answers based on the following text: "${text}". Please answer only with the questions in the following format:\nQ: {question}\nA: {answer}\n`;

  const GPTAPI = "https://api.openai.com/v1/chat/completions";

  const headers = {
    "Content-Type": "application/json",
    Authorization: `Bearer ${GPTKEY}`,
  };

  const data = {
    model: "gpt-3.5-turbo",
    messages: [{ role: "user", content: query }],
  };

  const response = await axios.post(GPTAPI, data, { headers });
  const message = response.data.choices[0].message.content;
  logger.info(message);
  const lines = message.split("\n");

  const pairs = [];
  for (let i = 0; i < lines.length; ) {
    const questionLine = lines[i];
    const answerLine = lines[i + 1];
    const questionRegex = new RegExp("Q[0-9]*:");
    const answerRegex = new RegExp("A[0-9]*:");
    if (!questionLine.match(questionRegex) || !answerLine.match(answerRegex)) {
      i++;
      continue;
    }
    const question = questionLine.split(questionRegex)[1];
    const answer = answerLine.split(answerRegex)[1];
    pairs.push({
      question: question,
      answer: answer,
    });
    i += 2;
  }
  logger.info(pairs);
  return pairs;
}
