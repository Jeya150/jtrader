import { createFileRoute } from '@tanstack/react-router'
import crypto from 'node:crypto'

export const Route = createFileRoute('/api/payments')({
  server: {
    handlers: {
      POST: async ({ request }) => {
        try {
          const body = await request.json()
          const { courseId, amount } = body

          if (!courseId || !amount) {
            return Response.json(
              { ok: false, error: 'Course and amount are required' },
              { status: 400 }
            )
          }

          const keyId = process.env.RAZORPAY_KEY_ID
          const keySecret = process.env.RAZORPAY_KEY_SECRET

          if (!keyId || !keySecret) {
            return Response.json(
              { ok: false, error: 'Razorpay is not configured' },
              { status: 500 }
            )
          }

          const auth = btoa(`${keyId}:${keySecret}`)

          const razorpayResponse = await fetch(
            'https://api.razorpay.com/v1/orders',
            {
              method: 'POST',
              headers: {
                Authorization: `Basic ${auth}`,
                'Content-Type': 'application/json',
              },
              body: JSON.stringify({
                amount: Math.round(Number(amount) * 100),
                currency: 'INR',
                receipt: `jtrader_${courseId}_${Date.now()}`,
              }),
            }
          )

          const order = await razorpayResponse.json()

          if (!razorpayResponse.ok) {
            return Response.json(
              { ok: false, error: order },
              { status: razorpayResponse.status }
            )
          }

          return Response.json({
            ok: true,
            keyId,
            orderId: order.id,
            amount: order.amount,
            currency: order.currency,
            courseId,
          })
        } catch (error) {
          console.error(error)

          return Response.json(
            { ok: false, error: 'Unable to create Razorpay order' },
            { status: 500 }
          )
        }
      },
    },
  },
})