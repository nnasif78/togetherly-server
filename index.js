
import express from "express";
import { MongoClient, ObjectId } from "mongodb";
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

  app.post("/events", async (req, res) => {
    try {
      const { title, description, date, location, category, maxParticipants, image, createdBy } = req.body;

      if (!title || !description || !date || !location || !category) {
        return res.status(400).send({ message: "Please provide all required fields." });
      }

      const newEvent = {
        title,
        description,
        date: new Date(date),
        location,
        category,
        maxParticipants: Number(maxParticipants) || 0,
        image: image || "",
        createdBy,
        participants: [],
        createdAt: new Date(),
      };

      const result = await db.collection("events").insertOne(newEvent);

      res.status(201).send({ message: "Event created successfully!", eventId: result.insertedId });
    } catch (error) {
      console.error("Create event error:", error);
      res.status(500).send({ message: "Failed to create event." });
    }
  });

  app.delete("/events/:id", async (req, res) => {
  try {
    const result = await db.collection("events").deleteOne({
      _id: new ObjectId(req.params.id),
    });

    if (result.deletedCount === 0) {
      return res.status(404).send({ message: "Event not found." });
    }

    res.send({ message: "Event deleted successfully!" });
  } catch (error) {
    console.error("Delete event error:", error);
    res.status(500).send({ message: "Failed to delete event." });
  }
    });

  app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
  });
}

startServer();