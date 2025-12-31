import { NextRequest, NextResponse } from 'next/server';
import { SiweMessage } from 'siwe';

// Get ASP endpoint from environment
const ASP_ENDPOINT = process.env.NEXT_PUBLIC_ASP_ENDPOINT_NON_TEST || process.env.NEXT_PUBLIC_ASP_ENDPOINT_TEST;

interface ReportAddressRequest {
  address: string;
  message: string;
  signature: string;
}

export async function POST(request: NextRequest) {
  try {
    const body: ReportAddressRequest = await request.json();
    const { address, message, signature } = body;

    // Validate required fields
    if (!address || !message || !signature) {
      return NextResponse.json({ error: 'Missing required fields: address, message, signature' }, { status: 400 });
    }

    // Verify SIWE signature on website side first
    try {
      const siweMessage = new SiweMessage(message);
      const result = await siweMessage.verify({ signature });

      if (!result.success) {
        return NextResponse.json({ error: 'Invalid signature' }, { status: 400 });
      }

      // Verify the address matches
      if (siweMessage.address.toLowerCase() !== address.toLowerCase()) {
        return NextResponse.json({ error: 'Address mismatch in signature' }, { status: 400 });
      }

      // Verify the message contains the expected statement about compromised address
      if (!siweMessage.statement?.includes('compromised')) {
        return NextResponse.json({ error: 'Invalid message statement' }, { status: 400 });
      }
    } catch (verifyError) {
      console.error('SIWE verification error:', verifyError);
      return NextResponse.json({ error: 'Signature verification failed' }, { status: 400 });
    }

    // Forward to ASP backend for double verification and storage
    if (!ASP_ENDPOINT) {
      console.error('ASP_ENDPOINT not configured');
      return NextResponse.json({ error: 'Server configuration error' }, { status: 500 });
    }

    const aspResponse = await fetch(`${ASP_ENDPOINT}/global/public/report-address`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        address,
        message,
        signature,
        reason: 'self_reported_compromised',
      }),
    });

    const aspData = await aspResponse.json();

    if (!aspResponse.ok) {
      console.error('ASP error:', aspData);
      return NextResponse.json(
        { error: aspData.message || aspData.error || 'Failed to report address' },
        { status: aspResponse.status },
      );
    }

    return NextResponse.json(
      {
        success: true,
        message: 'Address successfully reported as compromised',
        data: aspData,
      },
      { status: 200 },
    );
  } catch (error) {
    console.error('Self-report error:', error);
    const errorMessage = error instanceof Error ? error.message : 'Internal server error';
    return NextResponse.json({ error: errorMessage }, { status: 500 });
  }
}

// Handle preflight requests for CORS
export async function OPTIONS() {
  return new Response(null, {
    status: 200,
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
    },
  });
}
