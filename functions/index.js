const functions = require("firebase-functions");
const admin = require("firebase-admin");
const logger = require("firebase-functions/logger");
const { GPTKEY } = require("./secrets.js");
const axios = require("axios");
const express = require("express");

admin.initializeApp();
const app = express();

app.post("/generate", async (req, res) => {
  const payload = req.body;
  if (
    !(
      payload.key &&
      payload.uid &&
      (await validateAPIKey(payload.key, payload.uid))
    )
  ) {
    throw new functions.https.HttpsError(
      functions.https.HttpsError.UNAUTHENTICATED,
      "Unauthorized request"
    );
  }
  if (!payload.text || !payload.questionCount) {
    throw new functions.https.HttpsError(
      functions.https.HttpsError.INVALID_ARGUMENT,
      "Invalid payload format"
    );
  }
  logger.info(payload.text);

  res.send(await callGPT(payload.text, payload.questionCount));
});

async function validateAPIKey(key, uid) {
  realKeyDocument = await admin
    .firestore()
    .collection("apiKeys")
    .doc(uid)
    .get();
  if (!realKeyDocument.exists) {
    logger.info(`Document for ${uid} does not exist.`);
    return false;
  }
  realKey = realKeyDocument.data().key;
  if (!realKey) {
    logger.info(`Document for ${uid} does not have a key.`);
    return false;
  }
  if (key !== realKey) {
    logger.info(`Key does not match.`);
    return false;
  }
  return true;
}

async function callGPT(text, numberOfQuestions) {
  logger.info(`callGPT with text: ${text}`);
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

exports.api = functions.https.onRequest(app);
