import express from 'express';
import cors from 'cors';
import fs from 'fs-extra';
import path from 'path';
import multer from 'multer';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';

dotenv.config({ path: '.env.local' });

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 3001;
const DB_PATH = path.join(__dirname, 'db.json');

app.use(cors());
app.use(express.json());
app.use('/public', express.static(path.join(__dirname, 'public')));

// Multer setup for product uploads
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, 'public/');
  },
  filename: (req, file, cb) => {
    cb(null, Date.now() + '-' + file.originalname);
  }
});
const upload = multer({ storage });

// Helper to read/write DB
async function getDB() {
  const data = await fs.readJson(DB_PATH);
  return data;
}

async function saveDB(data: any) {
  await fs.writeJson(DB_PATH, data, { spaces: 2 });
}

// API Routes
app.get('/api/today', async (req, res) => {
  try {
    const db = await getDB();
    const todayStr = new Date().toISOString().split('T')[0];
    
    // Find product for today
    let product = db.products.find((p: any) => p.date === todayStr);
    
    // Fallback to the latest product if none for today
    if (!product && db.products.length > 0) {
      product = db.products[db.products.length - 1];
    }
    
    res.json(product);
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch product' });
  }
});

app.post('/api/purchase', async (req, res) => {
  const { productId, buyerName, amount } = req.body;
  try {
    const db = await getDB();
    const product = db.products.find((p: any) => p.id === productId);
    
    if (!product) return res.status(404).json({ error: 'Product not found' });
    if (product.status === 'sold') return res.status(400).json({ error: 'Already sold to another Legend' });

    // In a real app, we would lock this for a few minutes
    res.json({
      success: true,
      wallets: {
        sol: process.env.SOL_WALLET,
        bsc: process.env.BSC_WALLET
      }
    });
  } catch (error) {
    res.status(500).json({ error: 'Purchase error' });
  }
});

app.post('/api/confirm-payment', async (req, res) => {
  const { productId, buyerName, amount, method } = req.body;
  try {
    const db = await getDB();
    const product = db.products.find((p: any) => p.id === productId);
    
    if (!product) return res.status(404).json({ error: 'Product not found' });
    
    product.status = 'sold';
    product.buyer = buyerName;
    product.soldPrice = amount;
    product.paymentMethod = method;
    product.soldAt = new Date().toISOString();

    db.purchases.push({
      productId,
      buyerName,
      amount,
      method,
      date: new Date().toISOString()
    });

    await saveDB(db);
    res.json({ success: true, message: 'Payment recorded. You are a Legend.' });
  } catch (error) {
    res.status(500).json({ error: 'Database error' });
  }
});

// Admin routes
app.post('/api/admin/upload', upload.single('image'), async (req, res) => {
  const { name, price, date, description, password } = req.body;
  if (password !== process.env.ADMIN_PASSWORD) return res.status(401).json({ error: 'Unauthorized' });

  try {
    const db = await getDB();
    const newProduct = {
      id: Date.now().toString(),
      name,
      price: parseFloat(price),
      date: date || new Date().toISOString().split('T')[0],
      description,
      image: '/' + req.file?.filename,
      status: 'available',
      buyer: null,
      mock_messages: [
        "One legend. One day. Are you it?",
        "Don't let them take your glory.",
        "Precision in investment. Courage in purchase.",
        "Limited by time, defined by guts."
      ]
    };
    db.products.push(newProduct);
    await saveDB(db);
    res.json({ success: true, product: newProduct });
  } catch (error) {
    res.status(500).json({ error: 'Upload failed' });
  }
});

app.get('/api/admin/sales', async (req, res) => {
  const { password } = req.query;
  if (password !== process.env.ADMIN_PASSWORD) return res.status(401).json({ error: 'Unauthorized' });
  
  const db = await getDB();
  res.json(db.purchases);
});

app.listen(PORT, () => {
  console.log(`Backend running on http://localhost:${PORT}`);
});
