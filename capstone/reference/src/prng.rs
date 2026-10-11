//! mulberry32 (ENGINE.md section 3). One generator per run, drawn in the fixed order of section 3.

pub struct Rng {
    state: u32,
}

impl Rng {
    pub fn new(seed: u32) -> Rng {
        Rng { state: seed }
    }

    pub fn next_u32(&mut self) -> u32 {
        self.state = self.state.wrapping_add(0x6D2B_79F5);
        let mut t = self.state;
        t = (t ^ (t >> 15)).wrapping_mul(t | 1);
        t ^= t.wrapping_add((t ^ (t >> 7)).wrapping_mul(t | 61));
        t ^ (t >> 14)
    }

    /// percent() = next() % 100, 0 to 99.
    pub fn percent(&mut self) -> i64 {
        i64::from(self.next_u32() % 100)
    }

    /// below(n) = next() % n, for n >= 1.
    pub fn below(&mut self, n: i64) -> i64 {
        i64::from(self.next_u32()) % n
    }
}

#[cfg(test)]
mod tests {
    use super::Rng;

    #[test]
    fn matches_the_course_fixture_for_seed_zero() {
        // scenarios/fixtures/prng.json: the first 1,000 outputs of seeds 0, 1 and 20261010.
        let text = std::fs::read_to_string(concat!(env!("CARGO_MANIFEST_DIR"), "/../../scenarios/fixtures/prng.json"))
            .expect("fixture");
        let fixture: serde_json::Value = serde_json::from_str(&text).expect("json");
        for (seed, key) in [(0u32, "seed_0"), (1, "seed_1"), (20_261_010, "seed_20261010")] {
            let want = fixture["seeds"][key].as_array().expect("seed list");
            let mut rng = Rng::new(seed);
            for (index, value) in want.iter().enumerate() {
                assert_eq!(u64::from(rng.next_u32()), value.as_u64().expect("u32"), "seed {seed} draw {index}");
            }
        }
    }
}
