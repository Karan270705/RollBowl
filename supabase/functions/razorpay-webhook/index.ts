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

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  if (req.method !== 'POST') {
    return new Response('Method not allowed', { status: 405, headers: corsHeaders });
  }

  try {
    const webhookSecret = Deno.env.get('RAZORPAY_WEBHOOK_SECRET') ?? '';

    const signature = req.headers.get('x-razorpay-signature');
    if (!signature) {
      return new Response(JSON.stringify({ success: false, error: 'Missing signature' }), { 
        status: 400,
        headers: { 'Content-Type': 'application/json', ...corsHeaders }
      });
    }

    const payloadText = await req.text();
    const isValid = await verifySignature(payloadText, signature, webhookSecret);
    
    if (!isValid) {
      return new Response(JSON.stringify({ success: false, error: 'Invalid signature' }), { 
        status: 400,
        headers: { 'Content-Type': 'application/json', ...corsHeaders }
      });
    }

    const payload = JSON.parse(payloadText);
    const eventId = payload.id || `evt_${Date.now()}`;
    const eventType = payload.event;
    
    let razorpay_order_id = payload.payload?.payment?.entity?.order_id || payload.payload?.order?.entity?.id;
    let razorpay_payment_id = payload.payload?.payment?.entity?.id;

    const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? '';
    const supabaseAdmin = createClient(supabaseUrl, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '');

    // Idempotency check via razorpay_events table
    const { error: insertError } = await supabaseAdmin.from('razorpay_events').insert({
      event_id: eventId,
      event_type: eventType,
      razorpay_order_id,
      razorpay_payment_id,
      payload
    });

    if (insertError && insertError.code === '23505') {
      return new Response(JSON.stringify({ success: true, data: { message: 'Already processed' } }), { 
        status: 200,
        headers: { 'Content-Type': 'application/json', ...corsHeaders }
      });
    }
    
    let entityType = 'order';
    let entity = null;
    
    if (razorpay_order_id) {
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
    }

    if (eventType === 'payment.captured' || eventType === 'order.paid') {
       if (!entity) {
          await supabaseAdmin.from('razorpay_events').update({ error: 'Entity not found' }).eq('event_id', eventId);
          return new Response(JSON.stringify({ success: true }), { 
            status: 200,
            headers: { 'Content-Type': 'application/json', ...corsHeaders }
          });
       }

       const isAlreadyPaid = (entityType === 'order' && entity.payment_status === 'paid') ||
                             (entityType === 'subscription' && entity.status === 'approved');
       
       if (!isAlreadyPaid) {
          const paymentAmount = payload.payload?.payment?.entity?.amount;
          const expectedAmount = entityType === 'order' ? entity.total : entity.expected_amount;
          
          if (paymentAmount === Math.round(expectedAmount * 100)) {
              if (entityType === 'order') {
                  await supabaseAdmin.from('orders').update({
                    payment_status: 'paid',
                    payment_verification_status: 'verified',
                    status: 'confirmed',
                    razorpay_payment_id,
                    razorpay_signature: signature
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
                  const { data: plan } = await supabaseAdmin.from('subscription_plans').select('*').eq('id', entity.plan_id).single();
                  
                  const today = new Date().toISOString().split('T')[0];
                  const { data: expiryData } = await supabaseAdmin.rpc('calculate_subscription_expiry', {
                    p_start_date: today,
                    p_duration_days: plan.duration_days,
                    p_stall_id: entity.stall_id
                  });
                  
                  const new_end_date = expiryData?.new_end_date || expiryData?.[0]?.new_end_date;
                  const extended_days = expiryData?.extended_days || expiryData?.[0]?.extended_days || 0;
        
                  const { data: sub } = await supabaseAdmin.from('subscriptions').insert({
                    user_id: entity.user_id,
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
                    currency: 'INR'
                  }).select().single();
                  
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
                    razorpay_signature: signature
                  }).eq('id', entity.id);
                  
                  await supabaseAdmin.from('notifications').insert({
                    user_id: entity.user_id,
                    type: 'subscription',
                    title: 'Subscription Approved',
                    body: 'Your subscription purchase has been verified and approved!'
                  });
              }
          } else {
              await supabaseAdmin.from('razorpay_events').update({ error: 'Amount mismatch' }).eq('event_id', eventId);
          }
       }

       await supabaseAdmin.from('razorpay_events').update({ processed: true, processed_at: new Date().toISOString() }).eq('event_id', eventId);
    } else if (eventType === 'payment.failed') {
       if (entity) {
          if (entityType === 'order') {
             await supabaseAdmin.from('orders').update({
                 payment_verification_status: 'rejected'
             }).eq('id', entity.id);

             await supabaseAdmin.rpc('release_subscription_reservation', { 
                 p_order_id: entity.id, 
                 p_reason: 'Razorpay payment failed' 
             });
             
             await supabaseAdmin.from('notifications').insert({
                user_id: entity.user_id,
                type: 'order_update',
                title: 'Payment Failed',
                body: `Your payment for order ${entity.order_number} failed. Please try again.`
             });
          } else {
             await supabaseAdmin.from('subscription_purchase_requests').update({
                 status: 'rejected',
                 rejection_reason: 'Razorpay payment failed'
             }).eq('id', entity.id);
             
             await supabaseAdmin.from('notifications').insert({
                user_id: entity.user_id,
                type: 'subscription',
                title: 'Subscription Payment Failed',
                body: 'Your subscription payment failed. Please try again.'
             });
          }
       }
       await supabaseAdmin.from('razorpay_events').update({ processed: true, processed_at: new Date().toISOString() }).eq('event_id', eventId);
    }

    return new Response(JSON.stringify({ success: true, data: { received: true } }), {
      status: 200,
      headers: { 'Content-Type': 'application/json', ...corsHeaders },
    });

  } catch (error: any) {
    console.error('Function error:', {
      function: 'razorpay-webhook',
      error: error.message,
      stack: error.stack,
    });
    
    // Always return 200 to Razorpay so it doesn't loop infinitely
    return new Response(JSON.stringify({ success: true, data: { logged_error: error.message } }), {
      status: 200,
      headers: { 'Content-Type': 'application/json', ...corsHeaders },
    });
  }
});
