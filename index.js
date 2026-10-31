
import express from "express";
import { MongoClient, ObjectId } from "mongodb";
import cors from "cors";
import dotenv from "dotenv";
import { verifyToken } from "./middleware.js";

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
    app.get("/events/:id", async (req, res) => {
  try {
    const event = await db.collection("events").findOne({
      _id: new ObjectId(req.params.id),
    });

    if (!event) {
      return res.status(404).send({ message: "Event not found." });
    }

    res.send(event);
  } catch (error) {
    console.error("Get event error:", error);
    res.status(500).send({ message: "Failed to get event." });
  }
});
app.get("/my-events", verifyToken, async (req, res) => {
    try {
        const userId = req.user.id;

        const events = await db.collection("events")
            .find({ createdBy: userId })
            .toArray();

        res.send(events);
    } catch (error) {
        console.error("Get my events error:", error);
        res.status(500).send({ message: "Failed to get your events." });
    }
});
app.get("/joined-events", verifyToken, async (req, res) => {
  try {
    const events = await db.collection("events")
      .find({ participants: req.user.id })
      .toArray();

    res.send(events);
  } catch (error) {
    console.error("Get joined events error:", error);
    res.status(500).send({ message: "Failed to get joined events." });
  }
});
    app.post("/events", verifyToken, async (req, res) => {
        try {
            const { title, description, date, location, category, maxParticipants, image } = req.body;

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
                createdBy: req.user.id,
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

    app.delete("/events/:id", verifyToken, async (req, res) => {
        try {
            const result = await db.collection("events").deleteOne({
                _id: new ObjectId(req.params.id),
                createdBy: req.user.id,
            });

            if (result.deletedCount === 0) {
                return res.status(404).send({ message: "Event not found or you are not the owner." });
            }

            res.send({ message: "Event deleted successfully!" });
        } catch (error) {
            console.error("Delete event error:", error);
            res.status(500).send({ message: "Failed to delete event." });
        }
    });
    app.put("/events/:id", verifyToken, async (req, res) => {
        try {
            const { title, description, date, location, category, maxParticipants, image } = req.body;

            if (!title || !description || !date || !location || !category) {
                return res.status(400).send({ message: "Please provide all required fields." });
            }

            const result = await db.collection("events").updateOne(
                { _id: new ObjectId(req.params.id), createdBy: req.user.id },
                {
                    $set: {
                        title,
                        description,
                        date: new Date(date),
                        location,
                        category,
                        maxParticipants: Number(maxParticipants) || 0,
                        image: image || "",
                        updatedAt: new Date(),
                    },
                }
            );

            if (result.matchedCount === 0) {
                return res.status(404).send({ message: "Event not found." });
            }

            res.send({ message: "Event updated successfully!" });
        } catch (error) {
            console.error("Update event error:", error);
            res.status(500).send({ message: "Failed to update event." });
        }
    });

    app.post("/events/:id/join", verifyToken, async (req, res) => {
        try {
            const eventId = new ObjectId(req.params.id);
            const userId = req.user.id;
            const result = await db.collection("events").updateOne(
                {
                    _id: eventId,
                    participants: { $ne: userId },
                    $expr: {
                        $lt: [
                            { $size: { $ifNull: ["$participants", []] } },
                            "$maxParticipants",
                        ],
                    },
                },
                { $addToSet: { participants: userId } }
            );

            if (result.matchedCount === 0) {
                const event = await db.collection("events").findOne({ _id: eventId });
                if (!event) return res.status(404).send({ message: "Event not found." });
                if (event.participants?.includes(userId)) {
                    return res.status(400).send({ message: "You have already joined this event." });
                }
                return res.status(400).send({ message: "This event is full." });
            }

            res.send({ message: "You joined the event successfully!" });
        } catch (error) {
            console.error("Join event error:", error);
            res.status(500).send({ message: "Failed to join event." });
        }
    });

    app.listen(PORT, () => {
        console.log(`Server running on port ${PORT}`);
    });
}

startServer();
