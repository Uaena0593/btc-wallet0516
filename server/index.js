const express = require('express');
const cors = require('cors');
const Mnemonic = require('bitcore-mnemonic');
const ecc = require('tiny-secp256k1');
const assert = require('assert');
const app = express();
const bip39 = require('bip39');
const { BIP32Factory } = require('bip32');
const bip32 = BIP32Factory(ecc)
const bitcoin = require('bitcoinjs-lib');
const axios = require('axios');
const mysql = require('mysql');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const cookieParser = require('cookie-parser');
const { registerRoute, loginRoute, authenticateToken, holyPoggers, authenticateTokenMiddleware } = require('./authentication/authRoutes');
var request = require('request');


require('dotenv').config();

const stripe = require('stripe')(process.env.STRIPE_PRIVATE_KEY);
app.use(express.json())
const corsOptions = {
  origin: 'http://localhost:3000',
  credentials: true, 
};
app.use(cors(corsOptions));
app.use(cookieParser());

const PORT = 8000;
const connection = mysql.createConnection({
    host: 'localhost',
    user: 'root',
    password: process.env.DATABASE_CONNECTION_PW,
    database: 'btcwallet'
});

app.get('/testing', async (req, res)=>{
  try{
    const {stockBuyDate} = req.query
    console.log(stockBuyDate)
    const specificDate = '2024-04-04 14:21:00';
    const response = await axios.get(`https://financialmodelingprep.com/api/v3/historical-chart/1min/NVDA?from=2024-04-04&to=2024-04-04&apikey=${process.env.STOCK_PRIVATE_KEY}`)
    const entry = response.data.find(item => item.date === specificDate);
    console.log(entry)

  } catch(e) {
    console.log(e)
  }
});

app.get('/add-to-portfolio', authenticateTokenMiddleware, async (req, res) => {
  const { username } = req.user;
  const { numberOfShares, purchaseDate, purchaseTime, symbol } = req.query;
  const url = `https://financialmodelingprep.com/api/v3/historical-chart/1min/${symbol}?from=${purchaseDate}&to=${purchaseDate}&apikey=${process.env.STOCK_PRIVATE_KEY}`
  const response = await axios.get(url)
  const specificDate = `${purchaseDate} ${purchaseTime}:00`;
  const entry = response.data.find(item => item.date === specificDate);
  console.log(entry)
  const userIdQuery = 'SELECT id FROM users WHERE username = ?';
  connection.query(userIdQuery, [username], (err, results) => {
      if (err) {
          console.error(err);
          return res.status(500).json({ message: 'An error occurred' });
      }

      if (results.length === 0) {
          return res.status(404).json({ message: 'User not found' });
      }

      const userId = results[0].id;
      const insertQuery = `
          INSERT INTO portfolio (user_id, stock_symbol, purchase_date, purchase_time, buy_price, shares)
          VALUES (?, ?, ?, ?, ?, ?)
      `;
      // Inserting the new record
      connection.query(insertQuery, [userId, symbol, purchaseDate, purchaseTime, entry.low, numberOfShares], (err, insertResult) => {
          if (err) {
              console.error(err);
              return res.status(500).json({ message: 'An error occurred during portfolio update' });
          }
          res.status(200).json({ message: 'Portfolio updated successfully' });
      });
  });
});

app.get('/fetch-portfolio', authenticateTokenMiddleware, (req, res) => {
  const { username } = req.user;
  const query = `
    SELECT p.id, p.stock_symbol, p.purchase_date, p.purchase_time, p.buy_price, p.shares
    FROM users u
    JOIN portfolio p ON u.id = p.user_id
    WHERE u.username = ?
  `;

  connection.query(query, [username], (err, results) => {
    if (err) {
      console.error('Error fetching portfolio:', err);
      return res.status(500).json({ message: 'Error fetching portfolio' });
    }

    res.json(results);
  });
});

app.get('/query-stock-data', async (req, res) => {
  const { queryStockValue } = req.query;
  const url = `https://financialmodelingprep.com/api/v3/search?query=${queryStockValue}&exchange=NASDAQ&apikey=${process.env.STOCK_PRIVATE_KEY}`;

  try {
    const searchResponse = await axios.get(url);
    if (searchResponse.data && searchResponse.data.length > 0) {
      const profileRequests = searchResponse.data.map(stock => 
        axios.get(`https://financialmodelingprep.com/api/v3/profile/${stock.symbol}?apikey=${process.env.STOCK_PRIVATE_KEY}`)
      );
      const profileResponses = await Promise.all(profileRequests);
      const profileData = profileResponses.map(response => response.data);
      res.send(profileData);
    } else {
      res.send([]);
    }
  } catch (error) {
    console.error('error while fetching data', error);
    res.status(500).send('failed to fetch data');
  }
});
app.get('/get-symbol-information', async(req,res)=>{
  const { symbol } = req.query
  const url = `https://financialmodelingprep.com/api/v3/profile/${symbol}?apikey=${process.env.STOCK_PRIVATE_KEY}`
  try {
    const response = await axios.get(url)
  }catch (e) {
    console.log(e)
  }

})

//user registration
app.post('/register', registerRoute);
//user login
app.post('/login', loginRoute);

app.get('/authenticateToken', authenticateToken, holyPoggers);

app.get('/protected-route', authenticateToken, (req, res) => {
    res.status('This is a protected route');
});

app.get('/logout', async (req, res) => {
  res.cookie('accessToken', '', { expires: new Date(0), httpOnly: true, sameSite: 'strict' });
  res.send('Logged out');
});
connection.connect((err) => {
    if (err) {
        console.error('Error connecting to MySQL: ' + err.stack);
        return;
    }
    console.log('Connected to MySQL as id ' + connection.threadId);
});


app.get('/recovery', async (req, res) => {
    try{
        const { passphrase } = req.query;
        var code = new Mnemonic();
        var mnemonic_code = code.toString();
        console.log(mnemonic_code);

        var xpriv;
        if (passphrase) {
            xpriv = code.toHDPrivateKey(passphrase);
        } else {
            xpriv = code.toHDPrivateKey();
        }
        res.json({ mnemonic: mnemonic_code, xpriv });
    } catch(error){
        console.log(error)
    }
});

const storeItems = new Map([
  [1, { priceInCents: 10000, name: "Learn React Today" }],
  [2, { priceInCents: 20000, name: "Learn CSS Today" }],
])

app.post("/create-checkout-session", async (req, res) => {
  try {
    const session = await stripe.checkout.sessions.create({
      payment_method_types: ["card"],
      mode: "payment",
      line_items: req.body.items.map(item => {
        const storeItem = storeItems.get(item.id)
        return {
          price_data: {
            currency: "usd",
            product_data: {
              name: storeItem.name,
            },
            unit_amount: storeItem.priceInCents,
          },
          quantity: item.quantity,
        }
      }),
      success_url: `${process.env.SERVER_URL}/success.html`,
      cancel_url: `${process.env.SERVER_URL}/cancel.html`,
    })
    res.json({ url: session.url })
  } catch (e) {
    res.status(500).json({ error: e.message })
  }
})


app.get('/createKeys', async (req, res) => {
    const { xpriv, numKeys, rootPrivateKey } = req.query;
    const path = `m/44'/0'/0'/0/0`;

    try {
        if (!xpriv) {
            return res.status(400).send("missing xpriv key");
        }
        if (!numKeys) { 
            return res.status(400).send("missing numKeys");
        }
        const derivedKeys = [];
        for (let i = 0; i < numKeys; i++) {
            const rootNode = bip32.fromBase58(xpriv);
            const childNode = rootNode.derivePath(`${path}/${i}`);
            const publicKey = childNode.publicKey;
            const privateKeyWIF = childNode.toWIF();
            const publicKeyBuffer = Buffer.from(publicKey, 'hex');
            const publicKeyHex = publicKeyBuffer.toString('hex');
            const address = bitcoin.payments.p2pkh({ pubkey: publicKeyBuffer }).address;

            derivedKeys.push({
                address: address,
                publicKey: publicKeyHex,
                privateKey: privateKeyWIF
            });
        }
        res.json(derivedKeys)
    } catch (error) {
        console.log(error);
        res.status(500).send("Internal server error");
    }
});




app.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
});
