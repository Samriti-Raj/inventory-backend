const express = require("express");
const Product = require("../models/Product");
const router = express.Router();

// Add product
router.post("/add", async (req, res) => {
  const product = new Product(req.body);
  await product.save();
  res.json(product);
});

// Get all inventory
router.get("/", async (req, res) => {
  const products = await Product.find();
  res.json(products);
});

// Low stock alert
router.get("/low-stock", async (req, res) => {
  const products = await Product.find({ quantity: { $lt: 5 } });
  res.json(products);
});

// Dead stock (not sold in 30 days)
router.get("/dead-stock", async (req, res) => {
  const date = new Date();
  date.setDate(date.getDate() - 30);
  const products = await Product.find({ lastSoldAt: { $lt: date } });
  res.json(products);
});

module.exports = router;
