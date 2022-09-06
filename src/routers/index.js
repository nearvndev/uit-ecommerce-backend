import { Router } from "express";
import OrderModel from "../models/Orders";
import ProductModel from "../models/Products";
import shortid from "shortid";
import blockchain from "../blockchain";
import configs from "../configs";
const router = Router();

router.get("/", (req, res) => {
    res.json({
        message: "Hello World"
    })
});

// API lay danh sach san pham
router.get("/products", async (req, res) => {
    try {
        let products = await ProductModel.find();

        res.json(products);
    } catch (error) {
        res.status(400).json({error: error.message});
    }
});

// API tao don hang
/**
 * ex body:
 * {
 *  product: "63171ef66ab4e10a3b8876ca",
 *  quantity: 2,
 *  accountId: "vbidev.testnet",
 *  customer: {
 *  ///
 * }
 * }
 */
router.post("/orders", async (req, res) => {
    try {
        let product = await ProductModel.findById(req.body.product);
        if (!product) {
            throw Error("Not found product id: " + req.body.product);
        }

        let totalAmount = product.price * req.body.quantity;
        let order = new OrderModel({
            ...req.body,
            orderCode: shortid.generate(),
            totalAmount,
            paymentStatus: "PENDING"
        });
        await order.save();

        let networkConfig = configs.getConfig("testnet");

        // Redirect user sang vi de thanh toan
        let signUrl = await blockchain.getSignUrl(
            order.accountId,
            "pay_order",
            {
                order_id: order.id,
                order_amount: blockchain.parseNearAmount(order.totalAmount)
            },
            order.totalAmount,
            30000000000000,
            networkConfig.paymentContract,
            "",
            "http://localhost:3000/api/payment-noti?orderId="+order.id,
            "testnet"
        )

        res.json({
            orderId: order.id,
            redirectUrl: signUrl
        });
    } catch (error) {
        res.status(400).json({error: error.message});
    }
})


// API lay thong tin don hang
router.get("/orders/:orderId", async(req, res) => {
    try {
        let order = await OrderModel.findById(req.params.orderId).populate("product");
        if (!order) throw Error("Not found order id: " + req.params.orderId);
        res.json(order);
    } catch (error) {
        res.status(400).json({error: error.message});
    }
});

// kiem tra trang thai thanh toan va cap nhat database
router.get("/payment-noti", async (req, res) => {
    try {
        let order = await OrderModel.findById(req.query.orderId);
        if (!order || !req.query.orderId) throw Error("Not found order");

        if (order.paymentStatus == "PAID") {
            return res.json(order);
        }

        // Kiem tra trang thai thanh toan tren blockchain
        try {
            let networkConfig = configs.getConfig("testnet");
            let orderDetail = await blockchain.view(networkConfig.paymentContract, "get_order", {
                order_id: order.id
            });

            console.log("Order Detail: ", orderDetail);
            console.log("Amount: ", blockchain.parseNearAmount(order.totalAmount), orderDetail.received_amount.toLocaleString("fullwide", {useGrouping: false}));

            if (orderDetail.is_completed && blockchain.parseNearAmount(order.totalAmount) == orderDetail.received_amount.toLocaleString("fullwide", {useGrouping: false})) {
                order.paymentStatus = "PAID";
            } else {
                order.paymentStatus = "FAILED"
            }
        } catch (error) {
            order.paymentStatus = "FAIELD";
        }

        await order.save();

        res.json(order);

    } catch (error) {
        res.status(400).json({error: error.message});
    }
});

router.get("/test-call", async (req, res) => {
    try {
        let orderId = req.query.orderId;
        let order = await blockchain.call(
            "uit-payment-contract.vbidev.testnet",
            "get_order",
            {
                order_id: orderId
            },
            0,
            30000000000000
        )

        res.json(order);
    } catch (error) {
        res.status(400).json({error: error.message});
    }
})
export default router;