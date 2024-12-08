const express = require('express');
const bodyParser = require('body-parser');
const cors = require('cors');
const { WebSocketServer } = require('ws');

const app = express();
app.use(bodyParser.json());
app.use(cors());

// Mock Database
let foods = []; // Stores all food items
let menu = []; // Stores today's menu (IDs of selected foods)

// WebSocket Server
const wss = new WebSocketServer({ noServer: true });

// Function to broadcast updates to connected clients
function broadcastMenuUpdate() {
    const todayMenu = menu.map(foodId => foods.find(food => food.id === foodId));
    const message = JSON.stringify({ type: 'MENU_UPDATE', menu: todayMenu });

    wss.clients.forEach(client => {
        if (client.readyState === client.OPEN) {
            client.send(message);
        }
    });
}

// API: Add Food
app.post('/food', (req, res) => {
    const { name, price, image } = req.body;

    if (!name || !price || !image) {
        return res.status(400).json({ message: 'All fields are required!' });
    }

    const food = { id: Date.now(), name, price: parseFloat(price), image };
    foods.push(food);
    res.status(201).json({ message: 'Food added successfully!', food });
});

// API: Get All Foods
app.get('/food', (req, res) => {
    res.json(foods);
});

// API: Get Today's Menu
app.get('/menu', (req, res) => {
    const todayMenu = menu.map(foodId => foods.find(food => food.id === foodId));
    res.json({ menu: todayMenu });
});

// API: Save Today's Menu
app.put('/menu', (req, res) => {
    const { menu: selectedMenu } = req.body;

    const validIds = selectedMenu.filter(foodId => foods.some(food => food.id === foodId));
    if (validIds.length !== selectedMenu.length) {
        return res.status(400).json({ message: 'Some selected food IDs are invalid!' });
    }

    menu = validIds;
    broadcastMenuUpdate(); // Notify WebSocket clients
    res.json({ message: "Today's menu updated successfully!", menu });
});

// Edit Food API
app.put('/food/:id', (req, res) => {
    const { id } = req.params;
    const { name, price, image } = req.body;

    const foodIndex = foods.findIndex(food => food.id === parseInt(id));
    if (foodIndex === -1) {
        return res.status(404).json({ message: 'Food not found!' });
    }

    // Update food details
    foods[foodIndex] = {
        ...foods[foodIndex],
        name: name || foods[foodIndex].name,
        price: price ? parseFloat(price) : foods[foodIndex].price,
        image: image || foods[foodIndex].image,
    };

    res.json({ message: 'Food updated successfully!', food: foods[foodIndex] });
});

// Delete Food API
app.delete('/food/:id', (req, res) => {
    const { id } = req.params;

    const foodIndex = foods.findIndex(food => food.id === parseInt(id));
    if (foodIndex === -1) {
        return res.status(404).json({ message: 'Food not found!' });
    }

    // Remove the food item
    foods.splice(foodIndex, 1);

    // Remove from menu if it exists there
    menu = menu.filter(foodId => foodId !== parseInt(id));

    res.json({ message: 'Food deleted successfully!' });
});


// WebSocket Handling
const server = app.listen(3000, () => {
    console.log('Server is running on http://localhost:3000');
});

server.on('upgrade', (request, socket, head) => {
    wss.handleUpgrade(request, socket, head, socket => {
        wss.emit('connection', socket, request);
    });
});


// Use the dynamic PORT assigned by Render
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
