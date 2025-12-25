const express = require("express");
const mongoose = require("mongoose");
const cors = require("cors");
require("dotenv").config();

const app = express();
const PORT = process.env.PORT || 5000;

app.use(cors());
app.use(express.json());

const MONGO_URI = process.env.MONGO_URI || "mongodb://localhost:27017/inventory_db";

mongoose.connect(MONGO_URI)
  .then(() => console.log("MongoDB connected"))
  .catch((err) => console.error("MongoDB connection error:", err));

const productSchema = new mongoose.Schema({
  name: { type: String, required: true },
  sku: { type: String, required: true, unique: true },
  quantity: { type: Number, required: true, default: 0 },
  price: { type: Number, required: true },
  reorderLevel: { type: Number, default: 10 },
  lastSoldAt: { type: Date, default: null },
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now }
});

const Product = mongoose.model("Product", productSchema);

const saleSchema = new mongoose.Schema({
  productId: { type: mongoose.Schema.Types.ObjectId, ref: "Product", required: true },
  quantity: { type: Number, required: true },
  saleDate: { type: Date, default: Date.now },
  price: { type: Number, required: true }
});

const Sale = mongoose.model("Sale", saleSchema);


app.get("/health", (req, res) => {
  res.json({ status: "OK", message: "Server is running" });
});

app.get("/api/products", async (req, res) => {
  try {
    const products = await Product.find().sort({ createdAt: -1 });
    res.json(products);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post("/api/products/add", async (req, res) => {
  try {
    const { name, sku, quantity, price, reorderLevel } = req.body;
    if (!name || !sku || quantity === undefined || !price) {
      return res.status(400).json({ error: "All fields are required" });
    }

    const product = new Product({
      name,
      sku: sku.toUpperCase(),
      quantity: Number(quantity),
      price: Number(price),
      reorderLevel: reorderLevel ? Number(reorderLevel) : 10
    });

    await product.save();
    res.status(201).json({ message: "Product added successfully", product });
  } catch (error) {
    if (error.code === 11000) {
      res.status(400).json({ error: "SKU already exists" });
    } else {
      res.status(500).json({ error: error.message });
    }
  }
});


app.get("/api/products/low-stock", async (req, res) => {
  try {
    const products = await Product.find({
      $expr: { $lte: ["$quantity", "$reorderLevel"] }
    }).sort({ quantity: 1 });

    res.json(products);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.get("/api/products/dead-stock", async (req, res) => {
  try {
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
    const products = await Product.find({
      $or: [
        { lastSoldAt: { $lt: thirtyDaysAgo } },
        { lastSoldAt: null }
      ],
      quantity: { $gt: 0 } 
    }).sort({ lastSoldAt: 1 });

    res.json(products);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.get("/api/products/stats", async (req, res) => {
  try {
    const totalProducts = await Product.countDocuments();
    
    const lowStockCount = await Product.countDocuments({
      $expr: { $lte: ["$quantity", "$reorderLevel"] }
    });

    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
    
    const deadStockCount = await Product.countDocuments({
      $or: [
        { lastSoldAt: { $lt: thirtyDaysAgo } },
        { lastSoldAt: null }
      ],
      quantity: { $gt: 0 }
    });
    const products = await Product.find();
    const totalValue = products.reduce((sum, p) => sum + (p.quantity * p.price), 0);

    res.json({
      totalProducts,
      lowStockCount,
      deadStockCount,
      totalValue
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.put("/api/products/:id/quantity", async (req, res) => {
  try {
    const { id } = req.params;
    const { quantity } = req.body;

    const product = await Product.findByIdAndUpdate(
      id,
      { quantity: Number(quantity), updatedAt: Date.now() },
      { new: true }
    );

    if (!product) {
      return res.status(404).json({ error: "Product not found" });
    }

    res.json({ message: "Quantity updated", product });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post("/api/sales", async (req, res) => {
  try {
    const { productId, quantity, price } = req.body;

    const product = await Product.findById(productId);
    if (!product) {
      return res.status(404).json({ error: "Product not found" });
    }

    if (product.quantity < quantity) {
      return res.status(400).json({ error: "Insufficient stock" });
    }
    const sale = new Sale({ 
      productId, 
      quantity: Number(quantity), 
      price: Number(price) 
    });
    await sale.save();
    product.quantity -= Number(quantity);
    product.lastSoldAt = Date.now();
    product.updatedAt = Date.now();
    await product.save();

    res.json({ message: "Sale recorded successfully", sale, product });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});


app.delete("/api/products/:id", async (req, res) => {
  try {
    const product = await Product.findByIdAndDelete(req.params.id);
    if (!product) {
      return res.status(404).json({ error: "Product not found" });
    }
    res.json({ message: "Product deleted successfully" });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});


app.post("/api/ai/insights", async (req, res) => {
  try {
    const { products } = req.body;

    if (!products || products.length === 0) {
      return res.status(400).json({ error: "No products to analyze" });
    }

    const apiKey = process.env.GEMINI_API_KEY;
    
    if (!apiKey) {
      console.error("GEMINI_API_KEY not found");
      return res.status(500).json({ 
        error: "Gemini API key not configured"
      });
    }

    console.log("API Key found (first 10 chars):", apiKey.substring(0, 10));
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
    
    const lowStock = products.filter(p => p.quantity > 0 && p.quantity <= p.reorderLevel);
    const outOfStock = products.filter(p => p.quantity === 0);
    const deadStock = products.filter(p => {
      if (!p.lastSoldAt) return p.quantity > 0;
      return new Date(p.lastSoldAt) < thirtyDaysAgo && p.quantity > 0;
    });

    const totalValue = products.reduce((sum, p) => sum + (p.quantity * p.price), 0);
    const deadStockValue = deadStock.reduce((sum, p) => sum + (p.quantity * p.price), 0);

    const prompt = `You are an inventory management expert for an AEC materials business in India. Analyze this data and provide a clear, well-formatted analysis:

INVENTORY OVERVIEW:
- Total Products: ${products.length}
- Out of Stock: ${outOfStock.length} (URGENT)
- Low Stock: ${lowStock.length} (needs reorder)
- Dead Stock: ${deadStock.length} (no sales 30+ days)
- Total Value: ₹${totalValue.toLocaleString('en-IN')}
- Dead Stock Value: ₹${deadStockValue.toLocaleString('en-IN')}

Please provide a structured analysis with these sections:

HEALTH SCORE: Rate from 1-10 with a brief explanation

TOP 3 IMMEDIATE ACTIONS:
1. [First action with specific details]
2. [Second action with expected benefit]
3. [Third action with rationale]

OPTIMIZATION STRATEGY:
[One key strategy to improve inventory management]

CRITICAL WARNINGS:
[Any urgent issues that need immediate attention, or "None" if all is well]

Keep your response clear, direct, and actionable. Use simple formatting.`;

    console.log("Calling Gemini API...");

    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [{
            parts: [{ text: prompt }]
          }],
          generationConfig: {
            temperature: 0.7,
            maxOutputTokens: 2048
          }
        })
      }
    );

    console.log("📡 Response status:", response.status);

    if (!response.ok) {
      const errorText = await response.text();
      console.error("Gemini error:", errorText);
      throw new Error(`Gemini API error: ${response.status}`);
    }

    const data = await response.json();
    const insights = data.candidates[0].content.parts[0].text;
    
    console.log("Success!");
    res.json({ insights });

  } catch (error) {
    console.error("Error:", error.message);
    res.status(500).json({ error: error.message });
  }
});

app.get("/api/test-gemini", async (req, res) => {
  try {
    const apiKey = process.env.GEMINI_API_KEY;
    
    if (!apiKey) {
      return res.json({ 
        success: false,
        error: "GEMINI_API_KEY not found"
      });
    }

    console.log("Testing Gemini API...");
    console.log("API Key (first 10 chars):", apiKey.substring(0, 10));
    
    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [{
            parts: [{ text: "Say 'Hello! API is working!'" }]
          }]
        })
      }
    );
    
    console.log("Test Response Status:", response.status);
    const data = await response.json();
    
    if (response.ok) {
      res.json({ 
        success: true,
        message: "Gemini API is working!",
        response: data.candidates[0].content.parts[0].text,
        status: response.status
      });
    } else {
      res.json({ 
        success: false,
        status: response.status,
        error: data
      });
    }
    
  } catch (error) {
    res.json({ 
      success: false,
      error: error.message 
    });
  }
});

app.get("/api/alerts", async (req, res) => {
  try {
    const products = await Product.find();
    const alerts = [];
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
    products.forEach(p => {
      if (p.quantity === 0) {
        alerts.push({
          id: `${p._id}-outofstock`,
          type: "critical",
          title: "Out of Stock",
          message: `${p.name} (${p.sku}) is completely out of stock! Immediate reorder required.`,
          timestamp: new Date(),
          productId: p._id,
          acknowledged: false
        });
      }
      else if (p.quantity <= p.reorderLevel) {
        alerts.push({
          id: `${p._id}-lowstock`,
          type: "warning",
          title: "Low Stock Alert",
          message: `${p.name} (${p.sku}) is running low: only ${p.quantity} units remaining (reorder at ${p.reorderLevel})`,
          timestamp: new Date(),
          productId: p._id,
          acknowledged: false
        });
      }

      if ((!p.lastSoldAt || new Date(p.lastSoldAt) < thirtyDaysAgo) && p.quantity > 0) {
        const daysOld = p.lastSoldAt 
          ? Math.floor((new Date() - new Date(p.lastSoldAt)) / (1000 * 60 * 60 * 24))
          : 'Never sold';
        
        alerts.push({
          id: `${p._id}-deadstock`,
          type: "warning",
          title: "Dead Stock Detected",
          message: `${p.name} (${p.sku}) hasn't sold in ${daysOld === 'Never sold' ? daysOld.toLowerCase() : daysOld + ' days'}. Consider discount or discontinuation.`,
          timestamp: new Date(),
          productId: p._id,
          acknowledged: false
        });
      }
    });

    alerts.sort((a, b) => {
      if (a.type === "critical" && b.type !== "critical") return -1;
      if (a.type !== "critical" && b.type === "critical") return 1;
      return 0;
    });

    res.json(alerts);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.put("/api/alerts/:alertId/acknowledge", async (req, res) => {
  try {
    res.json({ 
      message: "Alert acknowledged",
      alertId: req.params.alertId 
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});


app.get("/api/products/search", async (req, res) => {
  try {
    const { query, status, sortBy } = req.query;
    
    let filter = {};
    if (query) {
      filter.$or = [
        { name: { $regex: query, $options: 'i' } },
        { sku: { $regex: query, $options: 'i' } }
      ];
    }
    
    if (status === 'low-stock') {
      filter.$expr = { $lte: ['$quantity', '$reorderLevel'] };
    } else if (status === 'out-of-stock') {
      filter.quantity = 0;
    } else if (status === 'in-stock') {
      filter.$expr = { $gt: ['$quantity', '$reorderLevel'] };
    }
    
    let products = await Product.find(filter);
    
    if (sortBy === 'quantity-asc') {
      products = products.sort((a, b) => a.quantity - b.quantity);
    } else if (sortBy === 'quantity-desc') {
      products = products.sort((a, b) => b.quantity - a.quantity);
    } else if (sortBy === 'value-desc') {
      products = products.sort((a, b) => (b.quantity * b.price) - (a.quantity * a.price));
    } else if (sortBy === 'name') {
      products = products.sort((a, b) => a.name.localeCompare(b.name));
    }
    
    res.json(products);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.get("/api/sales/history", async (req, res) => {
  try {
    const { days = 30 } = req.query;
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - Number(days));
    
    const sales = await Sale.find({ 
      saleDate: { $gte: startDate } 
    })
      .populate('productId', 'name sku')
      .sort({ saleDate: -1 })
      .limit(100);
    
    res.json(sales);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.get("/api/sales/summary", async (req, res) => {
  try {
    const { days = 30 } = req.query;
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - Number(days));
    
    const sales = await Sale.find({ 
      saleDate: { $gte: startDate } 
    }).populate('productId', 'name sku');
    
    const totalSales = sales.length;
    const totalRevenue = sales.reduce((sum, s) => sum + (s.quantity * s.price), 0);
    const totalUnits = sales.reduce((sum, s) => sum + s.quantity, 0);
    
    const productSales = {};
    sales.forEach(s => {
      const productId = s.productId._id.toString();
      if (!productSales[productId]) {
        productSales[productId] = {
          name: s.productId.name,
          sku: s.productId.sku,
          quantity: 0,
          revenue: 0
        };
      }
      productSales[productId].quantity += s.quantity;
      productSales[productId].revenue += s.quantity * s.price;
    });
    
    const topProducts = Object.values(productSales)
      .sort((a, b) => b.revenue - a.revenue)
      .slice(0, 5);
    
    res.json({
      totalSales,
      totalRevenue,
      totalUnits,
      averageOrderValue: totalSales > 0 ? totalRevenue / totalSales : 0,
      topProducts,
      period: `Last ${days} days`
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.get("/api/test-gemini", async (req, res) => {
  try {
    console.log("API Key exists:", !!process.env.GEMINI_API_KEY);
    console.log("API Key (first 10 chars):", process.env.GEMINI_API_KEY?.substring(0, 10));
    
    const testResponse = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${process.env.GEMINI_API_KEY}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [{
            parts: [{ text: "Say hello" }]
          }]
        })
      }
    );
    
    const data = await testResponse.json();
    res.json({ 
      status: testResponse.status, 
      ok: testResponse.ok,
      data 
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.use((req, res) => {
  res.status(404).json({ error: "Route not found" });
});

app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});