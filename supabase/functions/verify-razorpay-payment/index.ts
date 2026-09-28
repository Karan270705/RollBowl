import { createClient } from 'jsr:@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

async function verifySignature(
  data: string,
  signature: string,
  secret: string
): Promise<boolean> {
  try {
    const crypto = globalThis.crypto.subtle;
    const encoder = new TextEncoder();
    const dataBytes = encoder.encode(data);
    const keyBytes = encoder.encode(secret);

    const cryptoKey = await crypto.importKey(
      'raw',
      keyBytes,
      { name: 'HMAC', hash: 'SHA-256' },
      false,
      ['sign']
    );

    const signatureBuffer = await crypto.sign('HMAC', cryptoKey, dataBytes);
    const signatureArray = Array.from(new Uint8Array(signatureBuffer));
    const generated = signatureArray.map(b => b.toString(16).padStart(2, '0')).join('');

    return generated === signature;
  } catch {
    return false;
  }
}

async function fetchPaymentDetails(paymentId: string, keyId: string, keySecret: string) {
  const auth = btoa(`${keyId}:${keySecret}`);

  const response = await fetch(`https://api.razorpay.com/v1/payments/${paymentId}`, {
    method: 'GET',
    headers: {
      'Authorization': `Basic ${auth}`,
    },
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Razorpay API error: ${error}`);
  }

  return await response.json();
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const { razorpay_order_id, razorpay_payment_id, razorpay_signature } = await req.json();

    const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? '';
    const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY') ?? '';
    const authHeader = req.headers.get('Authorization') ?? '';

    const supabaseClient = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: authHeader } }
    });
    const supabaseAdmin = createClient(supabaseUrl, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '');

    const { data: { user }, error: authError } = await supabaseClient.auth.getUser();
    if (authError || !user) throw new Error('Unauthorized');

    const keyId = Deno.env.get('RAZORPAY_KEY_ID') ?? '';
    const keySecret = Deno.env.get('RAZORPAY_KEY_SECRET') ?? '';

    const dataToSign = `${razorpay_order_id}|${razorpay_payment_id}`;
    const isValid = await verifySignature(dataToSign, razorpay_signature, keySecret);
    if (!isValid) throw new Error('Invalid signature');

    let entityType = 'order';
    let entity = null;

    const { data: order } = await supabaseAdmin.from('orders').select('*').eq('razorpay_order_id', razorpay_order_id).maybeSingle();
    if (order) {
      entity = order;
    } else {
      const { data: subReq } = await supabaseAdmin.from('subscription_purchase_requests').select('*').eq('razorpay_order_id', razorpay_order_id).maybeSingle();
      if (subReq) {
        entityType = 'subscription';
        entity = subReq;
      }
    }

    if (!entity) throw new Error('Entity not found');
    if (entity.user_id !== user.id) throw new Error('Forbidden');

    // Idempotency check
    if (entityType === 'order' && entity.payment_status === 'paid') {
      return new Response(JSON.stringify({ success: true, data: { entity_type: entityType, entity_id: entity.id, status: 'already_paid' } }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' }});
    }
    if (entityType === 'subscription' && entity.status === 'approved') {
      return new Response(JSON.stringify({ success: true, data: { entity_type: entityType, entity_id: entity.id, status: 'already_paid' } }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' }});
    }

    const payment = await fetchPaymentDetails(razorpay_payment_id, keyId, keySecret);
    if (payment.status !== 'captured') {
       throw new Error(`Payment status is ${payment.status}, expected captured`);
    }

    const expectedAmount = entityType === 'order' ? entity.total : entity.expected_amount;
    if (payment.amount !== Math.round(expectedAmount * 100)) {
       throw new Error('Payment amount mismatch');
    }

    if (entityType === 'order') {
      await supabaseAdmin.from('orders').update({
        payment_status: 'paid',
        payment_verification_status: 'verified',
        status: 'confirmed',
        razorpay_payment_id,
        razorpay_signature
      }).eq('id', entity.id);

      await supabaseAdmin.from('payment_records').insert({
        order_id: entity.id,
        amount: entity.total,
        status: 'paid',
        method: 'razorpay'
      });
      
      await supabaseAdmin.from('notifications').insert({
        user_id: entity.user_id,
        type: 'order_update',
        title: 'Payment Verified',
        body: `Your payment for order ${entity.order_number} has been verified and confirmed.`
      });
    } else {
      console.log('[VERIFY PAYMENT] Processing subscription activation...');
      console.log('[VERIFY PAYMENT] Subscription request:', entity);

      const { data: plan, error: planError } = await supabaseAdmin.from('subscription_plans').select('*').eq('id', entity.plan_id).single();

      if (planError || !plan) {
        console.error('[VERIFY PAYMENT] Failed to fetch plan:', planError);
        throw new Error('Subscription plan not found: ' + (planError?.message || 'unknown error'));
      }

      console.log('[VERIFY PAYMENT] Plan details:', plan);

      const today = new Date().toISOString().split('T')[0];
      const { data: expiryData, error: expiryError } = await supabaseAdmin.rpc('calculate_subscription_expiry', {
        p_start_date: today,
        p_duration_days: plan.duration_days,
        p_stall_id: entity.stall_id
      });

      if (expiryError) {
        console.error('[VERIFY PAYMENT] Failed to calculate expiry:', expiryError);
        throw new Error('Failed to calculate expiry: ' + expiryError.message);
      }

      const new_end_date = expiryData?.new_end_date || expiryData?.[0]?.new_end_date;
      const extended_days = expiryData?.extended_days || expiryData?.[0]?.extended_days || 0;

      console.log('[VERIFY PAYMENT] Creating subscription with data:', {
        user_id: entity.user_id,
        stall_id: entity.stall_id,
        plan_id: plan.id,
        plan_name: plan.name,
        status: 'active',
        start_date: today,
        end_date: new_end_date,
        extended_days: extended_days,
        total_meals: plan.total_meals,
        consumed_meals: 0,
        remaining_meals: plan.total_meals,
        meals_per_day: plan.meals_per_day,
        daily_credits_used: 0,
        purchase_price: plan.price,
        currency: 'INR',
        has_category_credit_costs: !!plan.category_credit_costs,
        has_features: !!plan.features
      });

      const { data: sub, error: subError } = await supabaseAdmin.from('subscriptions').insert({
        user_id: entity.user_id,
        stall_id: entity.stall_id,
        plan_id: plan.id,
        plan_name: plan.name,
        status: 'active',
        start_date: today,
        end_date: new_end_date,
        extended_days: extended_days,
        total_meals: plan.total_meals,
        consumed_meals: 0,
        remaining_meals: plan.total_meals,
        meals_per_day: plan.meals_per_day,
        daily_credits_used: 0,
        purchase_price: plan.price,
        currency: 'INR',
        entitlement_credit_costs: plan.category_credit_costs || null,
        entitlement_features: plan.features || []
      }).select().single();

      if (subError) {
        console.error('[VERIFY PAYMENT] Subscription insert error:', {
          error: subError,
          code: subError.code,
          message: subError.message,
          details: subError.details,
          hint: subError.hint
        });
        throw new Error(`Failed to create subscription: ${subError.message || subError.code || 'unknown error'}`);
      }

      console.log('[VERIFY PAYMENT] Subscription created successfully:', sub?.id);

      await supabaseAdmin.from('payment_records').insert({
        subscription_id: sub.id,
        amount: entity.expected_amount,
        status: 'paid',
        method: 'razorpay'
      });

      await supabaseAdmin.from('subscription_purchase_requests').update({
        status: 'approved',
        approved_at: new Date().toISOString(),
        created_subscription_id: sub.id,
        razorpay_payment_id,
        razorpay_signature
      }).eq('id', entity.id);
      
      await supabaseAdmin.from('notifications').insert({
        user_id: entity.user_id,
        type: 'subscription',
        title: 'Subscription Approved',
        body: 'Your subscription purchase has been verified and approved!'
      });
    }

    return new Response(JSON.stringify({ 
      success: true, 
      data: { entity_type: entityType, entity_id: entity.id, status: 'verified' } 
    }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error: any) {
    console.error('Function error:', {
      function: 'verify-razorpay-payment',
      error: error.message,
      stack: error.stack,
    });

    return new Response(JSON.stringify({
      success: false,
      error: error.message,
    }), {
      status: error.status || 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
