import express from "express";
import { MongoClient, ObjectId } from "mongodb";
import "dotenv/config";
import cors from 'cors'

const app = express();
const PORT = 8000;

app.use(cors())
app.use(express.json())

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

// add new studio api
app.post("/add-new-studio", async (req, res) => {
  const data = req.body;
  const result = await newStudioCollection.insertOne(data);
  res.send(result)
});

// studios api 
app.get("/studios", async(req, res)=>{
    const data = await newStudioCollection.find().toArray()
    res.send(data)
})

// studios details api
app.get("/studios/:id", async(req, res)=>{
  const {id} = req.params
  const result = await newStudioCollection.findOne({_id: new ObjectId(id)})
  res.send(result)
})

// my-listings api
app.get("/my-listings", async (req, res) => {
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

app.get("/", (req, res) => {
  res.send({ message: "Server is working Fine!!" });
});

app.listen(PORT, () => {
  console.log(`Server is running at ${PORT}`);
});
