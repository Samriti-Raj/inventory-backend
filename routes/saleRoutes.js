const express = require("express");
const Product = require("../models/Product");
const Sale = require("../models/Sale");
const router = express.Router();

router.post("/sell", async (req, res) => {
  const { productId, quantity } = req.body;

  const product = await Product.findById(productId);
  if (!product || product.quantity < quantity) {
    return res.status(400).json({ message: "Insufficient stock" });
  }

  product.quantity -= quantity;
  product.lastSoldAt = new Date();
  await product.save();

  const sale = new Sale({ productId, quantity });
  await sale.save();

  res.json({ message: "Sale recorded", product });
});

module.exports = router;
