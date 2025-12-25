const express = require("express");
const router = express.Router();

// Mock / Rule-based AI Insights
router.post("/insights", async (req, res) => {
  try {
    const insights = {
      summary: "Inventory insights generated using internal business rules",
      metrics: {
        totalProducts: 5,
        lowStockItems: 2,
        deadStockItems: 5,
        inventoryValue: 40611
      },
      recommendations: [
        "Restock fast-moving items immediately",
        "Run discounts to clear dead stock",
        "Avoid reordering slow-moving SKUs",
        "Enable alerts for stock below threshold"
      ],
      generatedAt: new Date().toISOString(),
      source: "rule-engine"
    };

    res.status(200).json(insights);
  } catch (err) {
    res.status(500).json({ error: "Failed to generate insights" });
  }
});

module.exports = router;
