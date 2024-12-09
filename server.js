const express = require('express');
const bodyParser = require('body-parser');
const cors = require('cors');
const admin = require('firebase-admin');
const { WebSocketServer } = require('ws');

const app = express();
app.use(bodyParser.json());
app.use(cors());

// Firebase Admin Initialization
const serviceAccount = require('./firebase-admin-key.json'); // Replace with your service account key
admin.initializeApp({
    credential: admin.credential.cert(serviceAccount),
});

const db = admin.firestore();
const foodsCollection = db.collection('foods');
const menuCollection = db.collection('menu');

// WebSocket Server
const wss = new WebSocketServer({ noServer: true });

// API: Add Food
app.post('/food', async (req, res) => {
    const { name, price, image } = req.body;

    if (!name || !price || !image) {
        return res.status(400).json({ message: 'All fields are required!' });
    }

    try {
        const foodData = { name, price: parseFloat(price), image };
        const docRef = await foodsCollection.add(foodData);
        res.status(201).json({ message: 'Food added successfully!', food: { id: docRef.id, ...foodData } });
    } catch (error) {
        console.error('Error adding food:', error);
        res.status(500).json({ message: 'Internal server error' });
    }
});

// API: Get All Foods
app.get('/food', async (req, res) => {
    try {
        const snapshot = await foodsCollection.get();
        const foods = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        res.json(foods);
    } catch (error) {
        console.error('Error fetching foods:', error);
        res.status(500).json({ message: 'Internal server error' });
    }
});

// API: Save Today's Menu
app.put('/menu', async (req, res) => {
    const { menu: selectedMenu } = req.body;

    if (!Array.isArray(selectedMenu) || selectedMenu.length === 0) {
        return res.status(400).json({ message: 'Menu must be a non-empty array of valid food IDs.' });
    }

    try {
        const newMenu = { date: admin.firestore.Timestamp.now(), foodIds: selectedMenu };
        await menuCollection.add(newMenu);
        res.json({ message: "Today's menu saved successfully!" });
    } catch (error) {
        console.error('Error saving menu:', error);
        res.status(500).json({ message: 'Internal server error' });
    }
});

// API: Get Today's Menu
app.get('/menu', async (req, res) => {
    try {
        const snapshot = await menuCollection.orderBy('date', 'desc').limit(1).get();
        if (snapshot.empty) {
            return res.json({ menu: [] });
        }

        const menuDoc = snapshot.docs[0];
        const menuData = menuDoc.data();
        const foodIds = menuData.foodIds || [];

        const foodsSnapshot = await foodsCollection.where(admin.firestore.FieldPath.documentId(), 'in', foodIds).get();
        const todayMenu = foodsSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));

        res.json({ menu: todayMenu });
    } catch (error) {
        console.error('Error fetching menu:', error);
        res.status(500).json({ message: 'Internal server error' });
    }
});

// Start the server
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});
