import express from "express";
import { MongoClient, ObjectId } from "mongodb";
import "dotenv/config";
import cors from "cors";
import { createRemoteJWKSet, jwtVerify } from 'jose';

const app = express();
const PORT = 8000;

app.use(cors());
app.use(express.json());

const client = new MongoClient(process.env.MONGODB_URI);

export async function connectToMongoDB() {
  try {
    await client.connect();
    console.log("You successfully connected to MongoDB!");
    return client;
  } catch (err) {
    console.dir(err);
  }
}

const mongoClient = await connectToMongoDB();
const db = mongoClient.db("kreovix");
const newStudioCollection = db.collection("new-studio");
const studioBookingCollection = db.collection("studio-booking");
const wishlistCollection = db.collection("wishlists");

wishlistCollection
  .createIndex(
    { userId: 1, studioId: 1 },
    { unique: true }
  )
  .catch(console.error);


const JWKS = createRemoteJWKSet(
    new URL(`${process.env.CLIENT_URL}/api/auth/jwks`)
);

const verifyToken = async (req, res, next) => {
    const authHeader = req.headers.authorization;

    if (!authHeader?.startsWith("Bearer ")) {
        return res.status(401).send({
            msg: "Unauthorized!",
        });
    }

    const token = authHeader.split(" ")[1];

    if (!token) {
        return res.status(401).send({
            msg: "Unauthorized!",
        });
    }

    try {
        const { payload } = await jwtVerify(token, JWKS);

        req.user = payload;

        // console.log("JWT Verified Successfully!");
        // console.log("User ID:", payload.sub);

        next();
    } catch (error) {
        console.error("JWT Verification Error:", error);

        return res.status(401).send({
            msg: "Invalid or expired token!",
        });
    }
};

// add new studio api
app.post("/add-new-studio", verifyToken, async (req, res) => {
  const data = req.body;
  const result = await newStudioCollection.insertOne(data);
  res.send(result);
});

// studios api
app.get("/studios", async (req, res) => {
  const data = await newStudioCollection.find().toArray();
  res.send(data);
});

// show studio-featured
app.get("/studio-featured", async (req, res) => {
  const data = await newStudioCollection.find().limit(6).toArray();
  res.send(data);
});

// studios details api
app.get("/studios/:id", async (req, res) => {
  const { id } = req.params;
  const result = await newStudioCollection.findOne({ _id: new ObjectId(id) });
  res.send(result);
});

// my-listings api
app.get("/my-listings", verifyToken, async (req, res) => {
  try {
    const email = req.query.email;

    const data = await newStudioCollection
      .find({ ownerEmail: email })
      .toArray();

    res.send(data);
  } catch (error) {
    res.status(500).send({
      message: "Failed to fetch listings",
    });
  }
});

// my listing update api
app.patch("/my-listings/:id", verifyToken, async (req, res) => {
  const { id } = req.params;
  const updatedData = req.body;
  const result = await newStudioCollection.updateOne(
    { _id: new ObjectId(id) },
    { $set: updatedData },
  );
  res.json(result);
});

// delete my-listings api
app.delete("/my-listings/:id", verifyToken, async (req, res) => {
  const { id } = req.params;
  const result = await newStudioCollection.deleteOne({ _id: new ObjectId(id) });
  res.json(result);
});

// Studio Booking API
app.post("/booking", async (req, res) => {
  try {
    const data = req.body;

    // Check if studio is already booked at this time
    const existingBooking = await studioBookingCollection.findOne({
      studioId: data.studioId,
      bookingDate: data.bookingDate,
      startTime: { $lt: data.endTime },
      endTime: { $gt: data.startTime },
      status: { $in: ["pending", "confirmed"] },
    });

    if (existingBooking) {
      return res.status(409).send({
        message: "This studio is already booked at this time!",
      });
    }

    // Save booking
    const result = await studioBookingCollection.insertOne({
      ...data,
      status: "pending",
    });

    res.send(result);
  } catch (error) {
    res.status(500).send({
      message: "Booking failed!",
    });
  }
});

app.get("/my-bookings/:email", verifyToken, async (req, res) => {
  const { email } = req.params;
  const result = await studioBookingCollection
    .find({ userEmail: email })
    .toArray();
  res.send(result);
});

// cancel booking api
app.patch("/bookings/:id/cancel", verifyToken, async (req, res) => {
  const { id } = req.params;

  if (!ObjectId.isValid(id)) {
    return res.status(400).send({ message: "Invalid ID" });
  }

  const result = await studioBookingCollection.updateOne(
    {
      _id: new ObjectId(id),
      status: "pending",
    },
    {
      $set: { status: "cancelled" },
    },
  );

  res.send(result);
});



const isValidStudioId = (id) =>
  typeof id === "string" && /^[a-fA-F0-9]{24}$/.test(id);

// 1. Check if a studio is saved
app.get("/wishlist/check/:studioId", verifyToken, async (req, res) => {
  try {
    const { studioId } = req.params;
    const userId = req.user?.sub;

    if (!userId) {
      return res.status(401).json({
        message: "Unauthorized!",
      });
    }

    if (!isValidStudioId(studioId)) {
      return res.status(400).json({
        message: "Invalid studio ID!",
      });
    }

    const savedStudio = await wishlistCollection.findOne({
      userId,
      studioId: studioId.toLowerCase(),
    });

    return res.status(200).json({
      saved: !!savedStudio,
    });
  } catch (error) {
    console.error("Wishlist Check Error:", error);

    return res.status(500).json({
      message: "Failed to check wishlist!",
    });
  }
});

// 2. Save a studio
app.post("/wishlist", verifyToken, async (req, res) => {
  try {
    const { studioId } = req.body;
    const userId = req.user?.sub;

    if (!userId) {
      return res.status(401).json({
        message: "Unauthorized!",
      });
    }

    if (!isValidStudioId(studioId)) {
      return res.status(400).json({
        message: "Invalid studio ID!",
      });
    }

    const normalizedId = studioId.toLowerCase();

    // Check studio exists
    const studio = await newStudioCollection.findOne({
      _id: new ObjectId(normalizedId),
    });

    if (!studio) {
      return res.status(404).json({
        message: "Studio not found!",
      });
    }

    // Avoid duplicate entries
    await wishlistCollection.updateOne(
      {
        userId,
        studioId: normalizedId,
      },
      {
        $setOnInsert: {
          userId,
          studioId: normalizedId,
          createdAt: new Date(),
        },
      },
      { upsert: true }
    );

    return res.status(200).json({
      message: "Studio saved successfully!",
      saved: true,
    });
  } catch (error) {
    console.error("Save Studio Error:", error);

    return res.status(500).json({
      message: "Failed to save studio!",
    });
  }
});

// 3. Remove a saved studio
app.delete("/wishlist/:studioId", verifyToken, async (req, res) => {
  try {
    const { studioId } = req.params;
    const userId = req.user?.sub;

    if (!userId) {
      return res.status(401).json({
        message: "Unauthorized!",
      });
    }

    if (!isValidStudioId(studioId)) {
      return res.status(400).json({
        message: "Invalid studio ID!",
      });
    }

    await wishlistCollection.deleteOne({
      userId,
      studioId: studioId.toLowerCase(),
    });

    return res.status(200).json({
      message: "Studio removed from wishlist!",
      saved: false,
    });
  } catch (error) {
    console.error("Remove Studio Error:", error);

    return res.status(500).json({
      message: "Failed to remove studio!",
    });
  }
});


app.get("/wishlist", verifyToken, async (req, res) => {
  try {
    const userId = req.user.sub;

    const saved = await wishlistCollection
      .find({ userId })
      .sort({ createdAt: -1 })
      .toArray();

    const studioIds = saved
      .filter((item) =>
        /^[a-fA-F0-9]{24}$/.test(item.studioId)
      )
      .map((item) => new ObjectId(item.studioId));

    const studios = await newStudioCollection
      .find({
        _id: { $in: studioIds },
      })
      .toArray();

    const studioMap = new Map(
      studios.map((studio) => [
        studio._id.toString(),
        studio,
      ])
    );

    const orderedStudios = saved
      .map((item) => studioMap.get(item.studioId))
      .filter(Boolean);

    return res.status(200).json(orderedStudios);
  } catch (error) {
    console.error("Wishlist Error:", error);

    return res.status(500).json({
      message: "Failed to load wishlist!",
    });
  }
});



app.get("/", (req, res) => {
  res.send({ message: "Server is working Fine!!" });
});

app.listen(PORT, () => {
  console.log(`Server is running at ${PORT}`);
});
