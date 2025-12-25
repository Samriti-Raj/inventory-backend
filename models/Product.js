const mongoose = require("mongoose");

const productSchema = new mongoose.Schema({
  name: String,
  sku: String,
  quantity: Number,
  price: Number,
  lastSoldAt: Date
});

module.exports = mongoose.model("Product", productSchema);
