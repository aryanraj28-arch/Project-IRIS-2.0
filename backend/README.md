# IRIS 2.0 Vision Assistant - Backend

Backend API server for IRIS 2.0 Vision Assistant PWA with authentication, profile management, and payment processing.

## 🚀 Features

- **Authentication**: Register, login, JWT token verification
- **Profile Management**: Update user profile, upload profile images
- **Payment Integration**: Razorpay payment gateway for subscription plans
- **Subscription Management**: Free, Basic, Premium, and Device Owner plans
- **Image Upload**: Cloudinary integration for profile images
- **MongoDB**: User data persistence

## 📦 Tech Stack

- **Runtime**: Node.js + TypeScript
- **Framework**: Express.js
- **Database**: MongoDB (Mongoose)
- **Authentication**: JWT + bcryptjs
- **File Upload**: Multer + Cloudinary
- **Payment**: Razorpay
- **CORS**: Enabled for frontend communication

## 🛠️ Setup

### 1. Install Dependencies

```bash
npm install
```

### 2. Environment Variables

Create `.env` file with:

```env
# Server Configuration
PORT=5000
BACKEND_URL=http://localhost:5000
FRONTEND_URL=http://localhost:5173

# Database
MONGO_URI=your_mongodb_connection_string

# Authentication
JWT_SECRET=your_jwt_secret_key

# Cloudinary Configuration
CLOUDINARY_CLOUD_NAME=your_cloudinary_cloud_name
CLOUDINARY_API_KEY=your_cloudinary_api_key
CLOUDINARY_API_SECRET=your_cloudinary_api_secret
CLOUDINARY_URL=cloudinary://api_key:api_secret@cloud_name

# Razorpay Configuration
RAZORPAY_KEY_ID=your_razorpay_key_id
RAZORPAY_KEY_SECRET=your_razorpay_key_secret
```

**Note**: Copy `.env.example` and rename it to `.env`, then fill in your credentials.

### 3. Run Development Server

```bash
npm run dev
```

Server will start on `http://localhost:5000`

### 4. Build for Production

```bash
npm run build
npm start
```

## 📡 API Endpoints

### Authentication

- `POST /api/auth/register` - Register new user
- `POST /api/auth/login` - Login user
- `GET /api/auth/verify` - Verify JWT token

### Profile

- `GET /api/profile` - Get user profile (Protected)
- `PUT /api/profile` - Update profile (Protected)
- `DELETE /api/profile` - Delete account (Protected)

### Payment

- `POST /api/payment/create-order` - Create Razorpay order (Protected)
- `POST /api/payment/verify-payment` - Verify payment (Protected)
- `GET /api/payment/subscription-status` - Get subscription status (Protected)

### Health Check

- `GET /health` - Server health check

## 🔐 Authentication

Protected routes require JWT token in header:

```
x-auth-token: YOUR_JWT_TOKEN
```

or

```
Authorization: Bearer YOUR_JWT_TOKEN
```

## 💳 Subscription Plans

| Plan | Duration | Features |
|------|----------|----------|
| Free | Forever | Basic vision assistance |
| Basic | 1 month | Enhanced features |
| Premium | 1 month | All features + priority support |
| Device Owner | 6 months | Full access + hardware integration |

## 📁 Project Structure

```
backend/
├── src/
│   ├── config/
│   │   └── cloudinary.ts       # Cloudinary configuration
│   ├── controllers/
│   │   ├── authController.ts   # Authentication logic
│   │   ├── profileController.ts# Profile management
│   │   └── paymentController.ts# Payment processing
│   ├── middleware/
│   │   └── auth.ts             # JWT authentication middleware
│   ├── models/
│   │   └── User.ts             # User schema
│   ├── routes/
│   │   ├── auth.ts             # Auth routes
│   │   ├── profile.ts          # Profile routes
│   │   └── payment.ts          # Payment routes
│   └── index.ts                # App entry point
├── .env                        # Environment variables
├── .gitignore
├── package.json
├── tsconfig.json
└── README.md
```

## 🧪 Testing

Test endpoints using tools like:
- Postman
- Thunder Client
- cURL

Example login request:

```bash
curl -X POST http://localhost:5000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"user@example.com","password":"password123"}'
```

## 🔧 Development

- **Hot Reload**: Uses `ts-node-dev` for automatic restarts
- **TypeScript**: Full type safety
- **Error Handling**: Comprehensive error messages
- **Logging**: Console logging for debugging

## 📝 Notes

- MongoDB connection is required before server starts
- Cloudinary credentials needed for profile image uploads
- Razorpay keys needed for payment processing
- CORS configured for `localhost:5173` and `localhost:3000`

## 🤝 Integration with Frontend

Frontend should:
1. Store JWT token in localStorage/sessionStorage
2. Include token in protected API requests
3. Handle token expiration (7 days)
4. Redirect to login on 401 errors

## 📄 License

ISC
