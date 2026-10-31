
import express from "express";
import { MongoClient, ObjectId } from "mongodb";
import cors from "cors";
import dotenv from "dotenv";
import { verifyToken } from "./auth-middleware.js";

dotenv.config();

const app = express();
const client = new MongoClient(process.env.MONGODB_URI);
const db = client.db(process.env.DATABASE_NAME);
let connectionPromise;

const frontendOrigin = process.env.CLIENT_URL
    ? new URL(process.env.CLIENT_URL).origin
    : null;
const allowedOrigins = new Set(
    [frontendOrigin, "http://localhost:3000"].filter(Boolean)
);

app.use(cors({
    origin(origin, callback) {
        callback(null, !origin || allowedOrigins.has(origin));
    },
}));
app.use(express.json());

app.get("/", (req, res) => {
    res.send("Togetherly API is running");
});

app.use(async (req, res, next) => {
    try {
        if (!connectionPromise) {
            connectionPromise = client.connect()
                .then(() => db.collection("eventJoins").createIndex(
                    { eventId: 1, userId: 1 },
                    { unique: true, name: "unique_event_user_join" }
                ))
                .catch((error) => {
                    connectionPromise = undefined;
                    throw error;
                });
        }
        await connectionPromise;
        next();
    } catch (error) {
        console.error("MongoDB connection error:", error);
        res.status(500).send({ message: "Database connection failed." });
    }
});

function parseFutureEventDate(value) {
    if (typeof value !== "string") return null;

    const date = new Date(value);
    if (!Number.isFinite(date.getTime()) || date.getTime() <= Date.now()) return null;

    const dateParts = /^(\d{4})-(\d{2})-(\d{2})/.exec(value);
    if (dateParts) {
        const [, year, month, day] = dateParts.map(Number);
        const calendarDate = new Date(Date.UTC(year, month - 1, day));
        if (
            calendarDate.getUTCFullYear() !== year ||
            calendarDate.getUTCMonth() !== month - 1 ||
            calendarDate.getUTCDate() !== day
        ) {
            return null;
        }
    }

    return date;
}

function slugifyEventTitle(title) {
    return title
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-|-$/g, "");
}

function createEventSlug(event) {
    const date = new Date(event.date);
    const titleSlug = slugifyEventTitle(event.title) || "community-event";
    return `${titleSlug}-${date.toISOString().slice(0, 10)}`;
}

    app.get("/events", async (req, res) => {
        const events = await db.collection("events")
            .find({ date: { $gt: new Date() } })
            .sort({ date: 1 })
            .toArray();
        res.send(events);
    });
    app.get("/recent-events", async (req, res) => {
        const events = await db.collection("events")
            .find({ date: { $gt: new Date() } })
            .sort({ date: 1 })
            .limit(6)
            .toArray();
        res.send(events);
    });
    app.get("/events/by-slug/:slug", async (req, res) => {
        try {
            const match = /^(.*)-(\d{4}-\d{2}-\d{2})$/.exec(req.params.slug);
            if (!match) {
                return res.status(404).send({ message: "Event not found." });
            }

            const [, , datePart] = match;
            const date = new Date(`${datePart}T00:00:00.000Z`);
            if (!Number.isFinite(date.getTime()) || date.toISOString().slice(0, 10) !== datePart) {
                return res.status(404).send({ message: "Event not found." });
            }

            const nextDate = new Date(date);
            nextDate.setUTCDate(nextDate.getUTCDate() + 1);
            const candidates = await db.collection("events")
                .find({ date: { $gte: date, $lt: nextDate } })
                .toArray();
            const matches = candidates.filter((event) => createEventSlug(event) === req.params.slug);

            if (matches.length === 0) {
                return res.status(404).send({ message: "Event not found." });
            }
            if (matches.length > 1) {
                return res.status(409).send({ message: "This event link is ambiguous." });
            }

            res.send(matches[0]);
        } catch (error) {
            console.error("Get event by slug error:", error);
            res.status(500).send({ message: "Failed to get event." });
        }
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
    const joinRecords = await db.collection("eventJoins")
      .find({ userId: req.user.id })
      .project({ eventId: 1 })
      .toArray();
    const joinedEventIds = joinRecords.map((join) => join.eventId);

    const events = await db.collection("events")
      .find({
        $or: [
          { participants: req.user.id },
          { _id: { $in: joinedEventIds } },
        ],
      })
      .sort({ date: 1 })
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

            const eventDate = parseFutureEventDate(date);
            if (!eventDate) {
                return res.status(400).send({ message: "Event date must be a valid future date and time." });
            }

            const newEvent = {
                title,
                description,
                date: eventDate,
                location,
                category,
                maxParticipants: Number(maxParticipants) || 0,
                image: image || "",
                createdBy: req.user.id,
                createdByEmail: req.user.email,
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

            const eventDate = parseFutureEventDate(date);
            if (!eventDate) {
                return res.status(400).send({ message: "Event date must be a valid future date and time." });
            }

            const result = await db.collection("events").updateOne(
                { _id: new ObjectId(req.params.id), createdBy: req.user.id },
                {
                    $set: {
                        title,
                        description,
                        date: eventDate,
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
            const events = db.collection("events");
            const event = await events.findOne({ _id: eventId });

            if (!event) {
                return res.status(404).send({ message: "Event not found." });
            }

            let joinResult;
            try {
                joinResult = await db.collection("eventJoins").insertOne({
                    eventId,
                    userId,
                    user: {
                        id: userId,
                        email: req.user.email,
                    },
                    event: {
                        id: event._id,
                        title: event.title,
                        description: event.description,
                        date: event.date,
                        location: event.location,
                        category: event.category,
                        image: event.image || "",
                    },
                    joinedAt: new Date(),
                });
            } catch (error) {
                if (error?.code === 11000) {
                    return res.status(400).send({ message: "You have already joined this event." });
                }
                throw error;
            }

            if (event.participants?.includes(userId)) {
                return res.send({ message: "You joined the event successfully!" });
            }

            let result;
            try {
                result = await events.updateOne(
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
            } catch (error) {
                try {
                    await db.collection("eventJoins").deleteOne({ _id: joinResult.insertedId });
                } catch (cleanupError) {
                    console.error("Failed to roll back event join record:", cleanupError);
                }
                throw error;
            }

            if (result.matchedCount === 0) {
                const currentEvent = await events.findOne({ _id: eventId });

                if (!currentEvent) {
                    await db.collection("eventJoins").deleteOne({ _id: joinResult.insertedId });
                    return res.status(404).send({ message: "Event not found." });
                }

                if (currentEvent.participants?.includes(userId)) {
                    return res.send({ message: "You joined the event successfully!" });
                }

                await db.collection("eventJoins").deleteOne({ _id: joinResult.insertedId });
                return res.status(400).send({ message: "This event is full." });
            }

            res.send({ message: "You joined the event successfully!" });
        } catch (error) {
            console.error("Join event error:", error);
            res.status(500).send({ message: "Failed to join event." });
        }
    });

export default app;
