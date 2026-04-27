import { NextRequest, NextResponse } from 'next/server';
import { reverseGeocodeLocation } from '../../../../lib/reverse-geocode';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const latitude = Number(body?.latitude);
    const longitude = Number(body?.longitude);

    if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) {
      return NextResponse.json({ success: false, message: 'Invalid location coordinates.' }, { status: 400 });
    }

    const location = await reverseGeocodeLocation({
      accuracy: body?.accuracy,
      acceptLanguage: request.headers.get('accept-language'),
      capturedAt: body?.capturedAt,
      latitude,
      longitude,
    });

    return NextResponse.json({ success: true, location });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Could not resolve location name.';
    return NextResponse.json({ success: false, message }, { status: 500 });
  }
}
