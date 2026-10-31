import express from "express";
import { MongoClient } from "mongodb";
import cors from "cors";
import dotenv from "dotenv";

dotenv.config();

const app = express();
const PORT = process.env.PORT || 5000;

app.use(cors({ origin: process.env.CLIENT_URL }));
app.use(express.json());

const client = new MongoClient(process.env.MONGODB_URI);

async function startServer() {
  await client.connect();
  console.log("MongoDB connected!");

  const db = client.db(process.env.DATABASE_NAME);

  app.get("/", (req, res) => {
    res.send("Togetherly API is running");
  });

  app.get("/events", async (req, res) => {
    const events = await db.collection("events").find().toArray();
    res.send(events);
  });

  app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
  });
}

startServer();