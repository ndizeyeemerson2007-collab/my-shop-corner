import { NextRequest, NextResponse } from 'next/server';
import { getAuthenticatedAccount, supabaseAdmin } from '../../../../../lib/server-auth';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const productId = parseInt(id);
    if (isNaN(productId)) {
      return NextResponse.json({ error: 'Invalid product ID' }, { status: 400 });
    }

    const auth = await getAuthenticatedAccount(request);
    const userId = auth.ok ? auth.account.id : null;

    // Get vote counts
    const { data: votes, error: votesError } = await supabaseAdmin
      .from('product_votes')
      .select('vote')
      .eq('product_id', productId);

    if (votesError) {
      console.error('Votes fetch error:', votesError);
      return NextResponse.json({ error: 'Failed to fetch votes' }, { status: 500 });
    }

    let upVotes = 0;
    let downVotes = 0;
    votes?.forEach(v => {
      if (v.vote === 1) upVotes++;
      else if (v.vote === -1) downVotes++;
    });

    // Get user's vote
    let userVote = 0;
    if (userId) {
      const { data: userVoteData, error: userVoteError } = await supabaseAdmin
        .from('product_votes')
        .select('vote')
        .eq('product_id', productId)
        .eq('user_id', userId)
        .single();

      if (userVoteError && userVoteError.code !== 'PGRST116') { // PGRST116 is no rows
        console.error('User vote fetch error:', userVoteError);
        return NextResponse.json({ error: 'Failed to fetch user vote' }, { status: 500 });
      }

      if (userVoteData) {
        userVote = userVoteData.vote;
      }
    }

    return NextResponse.json({ upVotes, downVotes, userVote });
  } catch (error) {
    console.error('Vote GET error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const productId = parseInt(id);
    if (isNaN(productId)) {
      return NextResponse.json({ error: 'Invalid product ID' }, { status: 400 });
    }

    const auth = await getAuthenticatedAccount(request);
    if (!auth.ok) {
      return auth.response;
    }

    const body = await request.json();
    const { vote } = body;
    if (vote !== 1 && vote !== -1) {
      return NextResponse.json({ error: 'Invalid vote value' }, { status: 400 });
    }

    // Upsert the vote
    const { error: upsertError, data } = await supabaseAdmin
      .from('product_votes')
      .upsert({
        user_id: auth.account.id,
        product_id: productId,
        vote,
      });

    if (upsertError) {
      console.error('Vote upsert error:', upsertError);
      return NextResponse.json({ error: `Failed to save vote: ${upsertError.message}` }, { status: 500 });
    }

    if (!data) {
      // Check if record exists and update it instead
      const userId = auth.account.id;
      const { data: existingVote, error: checkError } = await supabaseAdmin
        .from('product_votes')
        .select('id')
        .eq('user_id', userId)
        .eq('product_id', productId)
        .single();

      if (!checkError && existingVote) {
        // Update existing vote
        const { error: updateError } = await supabaseAdmin
          .from('product_votes')
          .update({ vote })
          .eq('user_id', userId)
          .eq('product_id', productId);

        if (updateError) {
          console.error('Vote update error:', updateError);
          return NextResponse.json({ error: `Failed to update vote: ${updateError.message}` }, { status: 500 });
        }
      } else if (checkError?.code !== 'PGRST116') {
        // PGRST116 means no rows, which is expected for new votes
        console.error('Check existing vote error:', checkError);
        return NextResponse.json({ error: `Failed to check existing vote: ${checkError?.message}` }, { status: 500 });
      }
    }

    // Get updated counts
    const { data: votes, error: votesError } = await supabaseAdmin
      .from('product_votes')
      .select('vote')
      .eq('product_id', productId);

    if (votesError) {
      console.error('Votes fetch error:', votesError);
      return NextResponse.json({ error: 'Failed to fetch updated votes' }, { status: 500 });
    }

    let upVotes = 0;
    let downVotes = 0;
    votes?.forEach(v => {
      if (v.vote === 1) upVotes++;
      else if (v.vote === -1) downVotes++;
    });

    return NextResponse.json({ upVotes, downVotes, userVote: vote });
  } catch (error) {
    console.error('Vote POST error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}