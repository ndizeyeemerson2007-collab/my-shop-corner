const { createClient } = require('@supabase/supabase-js');


const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function main() {
  const { data: buckets, error: getError } = await supabaseAdmin.storage.listBuckets();
  if (getError) {
    console.error('Error listing buckets:', getError);
    return;
  }
  
  const bucketName = 'products';
  if (!buckets.find(b => b.name === bucketName)) {
    console.log(`Creating bucket ${bucketName}...`);
    const { error: createError } = await supabaseAdmin.storage.createBucket(bucketName, { public: true });
    if (createError) {
      console.error('Error creating bucket:', createError);
    } else {
      console.log('Bucket created successfully!');
    }
  } else {
    console.log(`Bucket ${bucketName} already exists.`);
  }
}
main();
