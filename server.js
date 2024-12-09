const express = require('express');
const bodyParser = require('body-parser');
const cors = require('cors');
const admin = require('firebase-admin');
const { WebSocketServer } = require('ws');

const app = express();
app.use(bodyParser.json());
app.use(cors());

// Firebase Admin Initialization
const serviceAccount = require('./firebase-admin-key.json'); // Ensure this file is in your project directory
admin.initializeApp({
    credential: admin.credential.cert(serviceAccount),
});

const db = admin.firestore();
const foodsCollection = db.collection('foods');
const menuCollection = db.collection('menu');

// WebSocket Server
const wss = new WebSocketServer({ noServer: true });

// Function to broadcast updates to connected clients
async function broadcastMenuUpdate() {
    const snapshot = await menuCollection.orderBy('date', 'desc').limit(1).get();
    if (snapshot.empty) return;

    const menuDoc = snapshot.docs[0];
    const menuData = menuDoc.data();
    const menuItems = menuData.foodIds || [];

    const foodsSnapshot = await foodsCollection.where(admin.firestore.FieldPath.documentId(), 'in', menuItems).get();
    const todayMenu = foodsSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));

    const message = JSON.stringify({ type: 'MENU_UPDATE', menu: todayMenu });

    wss.clients.forEach(client => {
        if (client.readyState === client.OPEN) {
            client.send(message);
        }
    });
}

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

// API: Save Today's Menu
app.put('/menu', async (req, res) => {
    const { menu: selectedMenu } = req.body;

    try {
        const foodsSnapshot = await foodsCollection.where(admin.firestore.FieldPath.documentId(), 'in', selectedMenu).get();

        if (foodsSnapshot.size !== selectedMenu.length) {
            return res.status(400).json({ message: 'Some selected food IDs are invalid!' });
        }

        const newMenu = { date: admin.firestore.Timestamp.now(), foodIds: selectedMenu };
        await menuCollection.add(newMenu);
        broadcastMenuUpdate(); // Notify WebSocket clients
        res.json({ message: "Today's menu updated successfully!" });
    } catch (error) {
        console.error('Error saving menu:', error);
        res.status(500).json({ message: 'Internal server error' });
    }
});

// Edit Food API
app.put('/food/:id', async (req, res) => {
    const { id } = req.params;
    const { name, price, image } = req.body;

    try {
        const foodRef = foodsCollection.doc(id);
        const foodDoc = await foodRef.get();

        if (!foodDoc.exists) {
            return res.status(404).json({ message: 'Food not found!' });
        }

        const updatedData = {
            ...(name && { name }),
            ...(price && { price: parseFloat(price) }),
            ...(image && { image }),
        };

        await foodRef.update(updatedData);
        res.json({ message: 'Food updated successfully!' });
    } catch (error) {
        console.error('Error updating food:', error);
        res.status(500).json({ message: 'Internal server error' });
    }
});

// Delete Food API
app.delete('/food/:id', async (req, res) => {
    const { id } = req.params;

    try {
        const foodRef = foodsCollection.doc(id);
        const foodDoc = await foodRef.get();

        if (!foodDoc.exists) {
            return res.status(404).json({ message: 'Food not found!' });
        }

        await foodRef.delete();
        res.json({ message: 'Food deleted successfully!' });
    } catch (error) {
        console.error('Error deleting food:', error);
        res.status(500).json({ message: 'Internal server error' });
    }
});

// Health Check Endpoint
app.get('/', (req, res) => {
    res.status(200).send('Service is live!');
});

// Use the dynamic PORT assigned by Render
const PORT = process.env.PORT || 3000;
const server = app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});

// WebSocket Handling
server.on('upgrade', (request, socket, head) => {
    wss.handleUpgrade(request, socket, head, socket => {
        wss.emit('connection', socket, request);
    });
});
