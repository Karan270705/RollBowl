import { createClient } from 'jsr:@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

async function createRazorpayOrder(
  amount: number, // in paise
  currency: string,
  receipt: string,
  notes: Record<string, string>,
  keyId: string,
  keySecret: string
) {
  const auth = btoa(`${keyId}:${keySecret}`);

  const response = await fetch('https://api.razorpay.com/v1/orders', {
    method: 'POST',
    headers: {
      'Authorization': `Basic ${auth}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      amount,
      currency,
      receipt,
      notes,
    }),
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
    const { type, entity_id, stall_id } = await req.json();

    const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? '';
    const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY') ?? '';
    const authHeader = req.headers.get('Authorization') ?? '';

    const supabaseClient = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: authHeader } }
    });
    const supabaseAdmin = createClient(supabaseUrl, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '');

    // Authenticate user
    const { data: { user }, error: authError } = await supabaseClient.auth.getUser();
    if (authError || !user) throw new Error('Unauthorized');

    let amount = 0;
    let expectedUserId = '';

    if (type === 'order') {
      const { data: order, error } = await supabaseAdmin
        .from('orders')
        .select('user_id, total, payment_status, payment_gateway')
        .eq('id', entity_id)
        .single();
        
      if (error || !order) throw new Error('Order not found');
      if (order.payment_status === 'paid') throw new Error('Already paid');
      
      expectedUserId = order.user_id;
      amount = order.total;
    } else if (type === 'subscription') {
      const { data: req, error } = await supabaseAdmin
        .from('subscription_purchase_requests')
        .select('user_id, expected_amount, status, payment_gateway')
        .eq('id', entity_id)
        .single();
        
      if (error || !req) throw new Error('Subscription request not found');
      if (req.status === 'approved') throw new Error('Already paid');
      
      expectedUserId = req.user_id;
      amount = req.expected_amount;
    } else {
      throw new Error('Invalid type');
    }

    if (expectedUserId !== user.id) throw new Error('Forbidden');
    if (amount <= 0) throw new Error('Amount must be greater than 0');

    const keyId = Deno.env.get('RAZORPAY_KEY_ID') ?? '';
    const keySecret = Deno.env.get('RAZORPAY_KEY_SECRET') ?? '';

    const rzpAmountPaise = Math.round(amount * 100);
    const notes = {
      stall_id,
      user_id: user.id,
      entity_type: type,
      entity_id
    };

    const rzpOrder = await createRazorpayOrder(
      rzpAmountPaise,
      'INR',
      `receipt_${entity_id.substring(0, 8)}`,
      notes,
      keyId,
      keySecret
    );

    // Update DB
    const table = type === 'order' ? 'orders' : 'subscription_purchase_requests';
    await supabaseAdmin.from(table).update({
      razorpay_order_id: rzpOrder.id,
      payment_gateway: 'razorpay'
    }).eq('id', entity_id);

    return new Response(JSON.stringify({ 
      success: true, 
      data: {
        razorpay_order_id: rzpOrder.id,
        amount: rzpAmountPaise,
        currency: 'INR',
        key_id: keyId
      }
    }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error: any) {
    console.error('Function error:', {
      function: 'create-razorpay-order',
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