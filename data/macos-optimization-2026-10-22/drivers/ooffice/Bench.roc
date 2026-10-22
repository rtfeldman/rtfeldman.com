import pf.Host exposing [echo!, now!]
import deflate.Deflate

Bench := [].{
	# The case arrives through the C entrypoint at runtime. This prevents
	# compile-time compression and gives both engines a fresh process for
	# each file/level case, without allocator history from other levels.
	run! : List(U8), List({ level : U64, expected : List(U8) }), U64, U64 => {}
	run! = |input, cases, reps, level_number| {
		level = Deflate.Level.from_u64(level_number) ?? crash "bad level"
		item = List.find_first(cases, |entry| entry.level == level_number) ?? crash "missing case"
		var $buf = List.with_capacity(Deflate.compress_bound(input.len()))
		warm_started = now!()
		$buf = Deflate.compress_into(input, level, $buf)
		if $buf != item.expected {
			crash "libdeflate output differs"
		}
		decoded = Deflate.decompress($buf) ?? crash "decompression failed"
		if decoded != input {
			crash "round-trip differs"
		}
		# Warm the same output storage that the measured calls will reuse.
		# Both engines spend at least 200 ms here, including the first call
		# and its verification, so short cases do not measure process startup.
		while now!() - warm_started < 200000000 {
			$buf = Deflate.compress_into(input, level, List.clear($buf))
			if $buf != item.expected {
				crash "warmup output differs"
			}
		}
		var $rep = 0.U64
		while $rep < reps {
			empty = List.clear($buf)
			start = now!()
			$buf = Deflate.compress_into(input, level, empty)
			elapsed = now!() - start
			if $buf != item.expected {
				crash "timed output differs"
			}
			echo!("rep\t${item.level.to_str()}\t${$rep.to_str()}\t${elapsed.to_str()}\t${$buf.len().to_str()}")
			$rep = $rep + 1
		}
	}
}
