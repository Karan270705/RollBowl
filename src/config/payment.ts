export const PAYMENT_CONFIG = {
  razorpay: {
    enabled: true, // Toggle for gradual rollout
    testMode: true, // Will use test keys
  },
  methods: {
    cash: true,
    razorpay: true,
  },
};
