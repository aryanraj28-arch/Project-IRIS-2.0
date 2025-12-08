# Render Deployment Guide for IRIS Backend

## 🚀 Deployment Steps

### 1. Build Command
```
npm install && npm run build
```

### 2. Start Command
```
npm start
```

### 3. Environment Variables to Set in Render Dashboard

Add these in Render's Environment section:

```env
NODE_ENV=production
PORT=10000
BACKEND_URL=https://your-backend-url.onrender.com
FRONTEND_URL=https://your-frontend-url.com

MONGO_URI=mongodb+srv://username:password@cluster.mongodb.net/iris?appName=Cluster0
JWT_SECRET=your_production_secret_key_here

CLOUDINARY_CLOUD_NAME=your_cloud_name
CLOUDINARY_API_KEY=your_api_key
CLOUDINARY_API_SECRET=your_api_secret
CLOUDINARY_URL=cloudinary://api_key:api_secret@cloud_name

RAZORPAY_KEY_ID=rzp_live_or_test_key_id
RAZORPAY_KEY_SECRET=your_razorpay_secret
```

## ⚙️ Render Configuration

### Service Settings:
- **Environment**: Node
- **Build Command**: `npm install && npm run build`
- **Start Command**: `npm start`
- **Auto-Deploy**: Yes (recommended)

### Port Configuration:
- Render automatically sets the `PORT` environment variable
- The app listens on `0.0.0.0:${PORT}` (all network interfaces)
- Health check endpoint: `/health`

## 🔍 Troubleshooting

### "No open ports detected" Error
**Fixed!** The server now listens on `0.0.0.0` instead of `localhost`:
```typescript
app.listen(PORT, '0.0.0.0', () => {
  console.log(`🚀 Server running on 0.0.0.0:${PORT}`);
});
```

### Build Fails
- Check that all dependencies are in `dependencies` (not `devDependencies`)
- Ensure TypeScript compiles without errors: `npm run build`

### MongoDB Connection Issues
- Whitelist Render's IP addresses in MongoDB Atlas
- Better: Allow access from anywhere (0.0.0.0/0) for Render

### CORS Issues
- Update `FRONTEND_URL` in Render environment variables
- Make sure it matches your actual frontend URL

## 📝 Pre-Deployment Checklist

- [ ] All environment variables added in Render dashboard
- [ ] MongoDB Atlas allows Render IP addresses (0.0.0.0/0)
- [ ] `FRONTEND_URL` matches your deployed frontend
- [ ] `BACKEND_URL` will match your Render backend URL
- [ ] Using production Razorpay keys (not test keys)
- [ ] Strong `JWT_SECRET` for production

## 🎯 Post-Deployment Testing

Test your endpoints:

```bash
# Health check
curl https://your-backend-url.onrender.com/health

# Register test user
curl -X POST https://your-backend-url.onrender.com/api/auth/register \
  -H "Content-Type: application/json" \
  -d '{"name":"Test","email":"test@example.com","password":"password123"}'
```

## 🔄 Continuous Deployment

Every push to `main` branch will trigger:
1. New build on Render
2. Run `npm install && npm run build`
3. Deploy with `npm start`

## 📊 Monitoring

- Check Render logs for errors
- Monitor MongoDB Atlas for connection issues
- Set up Render health checks on `/health` endpoint
