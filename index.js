// index.js
import 'dotenv/config';
import express from 'express';
import compression from 'compression';
import cors from 'cors';
import chalk from 'chalk';
import qrcode from 'qrcode-terminal';
import fs from 'fs';
import path from 'path';
import { WebhookClient } from 'dialogflow-fulfillment';
import { SessionsClient } from '@google-cloud/dialogflow';
import { initializeApp, cert } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import OpenAI from 'openai';
import whatsappWeb from 'whatsapp-web.js';

const { Client, LocalAuth } = whatsappWeb;

// ——————————————————————————————————————
// Carga credenciales de Firebase / Dialogflow
// ——————————————————————————————————————
const firebaseCredentials = process.env.FIREBASE_JSON
  ? JSON.parse(Buffer.from(process.env.FIREBASE_JSON, 'base64').toString('utf8'))
  : JSON.parse(fs.readFileSync('./serviceAccount.json
