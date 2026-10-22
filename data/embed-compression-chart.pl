#!/usr/bin/env perl
use strict;
use warnings;
use utf8;
use FindBin;
use File::Spec;
use POSIX qw(ceil);
binmode STDOUT, ':encoding(UTF-8)';

# No non-core modules. Edit the rendered article directly from now on:
# this script replaces ONLY its marked chart and CSS, never its prose.
# Usage: perl data/embed-compression-chart.pl [rendered-article.html]
my $root = File::Spec->catdir($FindBin::Bin, '..');
my $article = shift // "$root/rendered/fp-vs-c.html";
die "Usage: $0 [rendered-article.html]\n" if @ARGV;
my @datasets = (
    { id => 'mac', label => 'M1 MacBook Pro', file => 'macos-optimization-2026-10-22/roc-deflate-compression-timings.csv',
      field => 'mb_per_s', samples => 15 },
    { id => 'linux', label => 'Ryzen 3900X Ubuntu', file => 'x64-2026-10-22-final/compression-medians.csv',
      field => 'median_mb_per_s', samples => 1 },
);
my @engines = ('libdeflate', 'roc-deflate');
my @corpora = qw(dickens mozilla mr nci ooffice osdb reymont samba sao webster x-ray xml);
my %known_corpus = map { $_ => 1 } @corpora;
my $maximum = 0;
for my $d (@datasets) {
    my $rows = read_csv("$root/data/$d->{file}");
    my (%counts, %seen);
    for my $r (@$rows) {
        my ($engine, $level, $corpus, $speed) = @{$r}{'engine', 'level', 'corpus', $d->{field}};
        die "Unexpected engine in $d->{file}\n" unless defined($engine) && grep { $_ eq $engine } @engines;
        die "Unexpected level in $d->{file}\n" unless defined($level) && $level =~ /\A(?:[1-9]|1[0-2])\z/;
        die "Unexpected corpus in $d->{file}\n" unless defined($corpus) && $known_corpus{$corpus};
        die "Invalid throughput in $d->{file}\n" unless defined($speed) && $speed =~ /\A\d+(?:\.\d+)?\z/ && $speed > 0;
        my $key = join ':', $engine, $level, $corpus;
        $counts{$key}++;
        my $sample = $key;
        if ($d->{id} eq 'mac') {
            die "Invalid Mac repetition\n" unless ($r->{round} // '') =~ /\A[1-3]\z/ && ($r->{rep} // '') =~ /\A[1-5]\z/;
            $sample .= ":$r->{round}:$r->{rep}";
        } else {
            die "Unexpected Linux sampling\n" unless ($r->{reported_repetitions} // '') eq '7';
        }
        die "Duplicate sample: $sample\n" if $seen{$sample}++;
        my $range = ($d->{ranges}{$level}{$engine} //= {});
        for my $end ('min', 'max') {
            if (!exists($range->{$end}) || ($end eq 'min' ? $speed < $range->{$end}{speed} : $speed > $range->{$end}{speed})) {
                $range->{$end} = { speed => 0 + $speed, corpus => $corpus };
            }
        }
        $maximum = $speed if $speed > $maximum;
    }
    for my $level (1 .. 12) {
        for my $engine (@engines) {
            for my $corpus (@corpora) {
                die "Missing or incomplete case: $d->{id} $engine L$level $corpus\n"
                    unless ($counts{"$engine:$level:$corpus"} // 0) == $d->{samples};
            }
        }
    }
    printf "%s: validated %d observations, 12 levels × 12 files × 2 engines\n", $d->{label}, scalar(@$rows);
}
# Both machine views share a linear scale, with round 100 MB/s ticks.
my $axis_max = ceil($maximum / 100) * 100;
my $legend_height = sprintf '%.6f', 100 * 400 / $axis_max;
my $html = <<'HTML';
<!-- BEGIN COMPRESSION CHART -->
<figure class="compression-chart" aria-labelledby="chart">
  <figcaption>
    <h3 id="chart"><a class="heading-link" href="#chart">Compression on Silesia corpus</a></h3>
  </figcaption>
  <input class="chart-radio" type="radio" name="compression-machine" id="chart-mac" checked />
  <input class="chart-radio" type="radio" name="compression-machine" id="chart-linux" />
  <div class="chart-controls" role="group" aria-label="Benchmark machine">
    <label for="chart-mac">M1 MacBook Pro</label>
    <label for="chart-linux">Ryzen 3900X Ubuntu</label>
  </div>
HTML
for my $d (@datasets) {
    my ($id, $label) = @{$d}{'id', 'label'};
    my $qualifier = $id eq 'mac' ? 'run' : 'median result';
    $html .= qq{  <section class="chart-panel chart-panel-$id" aria-label="$label throughput">
    <div class="chart-axis-title">MB/s <span class="chart-faster"><span class="chart-up-arrow" aria-hidden="true">↑</span> faster</span></div>
    <div class="chart-frame">
      <div class="chart-y-axis" aria-hidden="true">
};
    for (my $tick = $axis_max; $tick >= 0; $tick -= 100) {
        $html .= sprintf qq{        <span style="bottom:%.6f%%">%d</span>\n}, 100 * $tick / $axis_max, $tick;
    }
    $html .= qq{      </div>
      <div class="chart-plot">
        <div class="chart-grid" aria-hidden="true">
};
    for (my $tick = 0; $tick <= $axis_max; $tick += 100) {
        $html .= sprintf qq{          <span style="bottom:%.6f%%"></span>\n}, 100 * $tick / $axis_max;
    }
    $html .= qq{        </div>
        <div class="chart-groups">
};
    for my $level (1 .. 12) {
        $html .= qq{          <div class="chart-level">
            <div class="chart-pair">
};
        for my $engine (@engines) {
            my $range = $d->{ranges}{$level}{$engine};
            my ($min, $max) = @{$range}{'min', 'max'};
            my $name = $engine;
            my $class = $engine eq 'roc-deflate' ? 'roc' : 'libdeflate';
            my $description = sprintf q{%s's slowest L%d %s was "%s" at %.2f MB/s, and its fastest was "%s" at %.2f MB/s.},
                $name, $level, $qualifier, $min->{corpus}, $min->{speed}, $max->{corpus}, $max->{speed};
            my $tooltip = escape_html($description);
            $html .= sprintf qq{              <div class="chart-bar chart-bar-%s" style="height:%.6f%%" tabindex="0" role="img" aria-label="%s" title="%s">
                <span class="chart-low" style="height:%.6f%%" title="%s" aria-hidden="true"></span>
                <span class="chart-high" style="height:%.6f%%" title="%s" aria-hidden="true"></span>
              </div>
}, $class, 100 * $max->{speed} / $axis_max, $tooltip, $tooltip,
                100 * $min->{speed} / $max->{speed}, $tooltip,
                100 * ($max->{speed} - $min->{speed}) / $max->{speed}, $tooltip;
        }
        $html .= qq{            </div>
            <span class="chart-level-label">L$level</span>
          </div>
};
    }
    $html .= qq{        </div>
        <div class="chart-legend" style="height:$legend_height%" aria-label="Chart legend">
          <span>slowest libdeflate run<i class="legend-c-low" aria-hidden="true"></i></span>
          <span>gap with fastest libdeflate run<i class="legend-c-high" aria-hidden="true"></i></span>
          <span>slowest roc-deflate run<i class="legend-roc-low" aria-hidden="true"></i></span>
          <span>gap with fastest roc-deflate run<i class="legend-roc-high" aria-hidden="true"></i></span>
        </div>
      </div>
    </div>
    <p class="chart-x-axis">Compression Level</p>
  </section>
};
}
$html .= <<'HTML';
</figure>
<!-- END COMPRESSION CHART -->
HTML

my $css = <<'CSS';
<!-- BEGIN COMPRESSION CHART STYLE -->
<style>
/* Chart heights are generated from CSVs by data/embed-compression-chart.pl. */
.compression-chart {
    --chart-surface: #faf9fd;
    --chart-border: #dedbe7;
    --chart-grid: #e6e3ec;
    --chart-muted: #605b6e;
    --roc-low: #c5abf5;
    --roc-high: #6426b5;
    --c-low: #c8c8cc;
    --c-high: #50515a;
    --chart-height: 340px;
    --chart-axis-width: 38px;
    --chart-label-font-size: 13px;
    position: relative;
    display: grid;
    grid-template-columns: minmax(0, 1fr) auto;
    column-gap: 16px;
    align-items: center;
    margin: 1.75rem 0 2rem;
    padding: 22px 22px 18px 20px;
    border: 1px solid var(--chart-border);
    border-radius: 14px;
    background: var(--chart-surface);
    color: var(--text-color);
    font-family: inherit;
    font-size: inherit;
    font-variant-numeric: tabular-nums;
    line-height: 1.5;
}
.compression-chart *, .compression-chart *::before, .compression-chart *::after { box-sizing: border-box; }
.compression-chart h3 { margin: 0; font-size: 21px; line-height: 1.3; font-weight: 700; }
.compression-chart p { line-height: 1.5; }
.compression-chart figcaption { grid-column: 1; grid-row: 1; }
.chart-radio { position: absolute; width: 1px; height: 1px; overflow: hidden; clip-path: inset(50%); }
.chart-controls { grid-column: 2; grid-row: 1; justify-self: end; display: flex; gap: 4px; padding: 4px; border: 1px solid var(--chart-border); border-radius: 9px; width: fit-content; max-width: 100%; }
.chart-controls label { display: flex; min-width: 0; align-items: center; justify-content: center; min-height: 40px; padding: 7px 13px; border-radius: 6px; cursor: pointer; font-size: 13px; font-weight: 400; text-align: center; }
#chart-mac:checked ~ .chart-controls label[for="chart-mac"],
#chart-linux:checked ~ .chart-controls label[for="chart-linux"] { background: var(--heading-color); color: var(--body-bg-color); }
#chart-mac:focus-visible ~ .chart-controls label[for="chart-mac"],
#chart-linux:focus-visible ~ .chart-controls label[for="chart-linux"] { outline: 3px solid var(--link-color); outline-offset: 3px; }
.chart-panel { display: none; grid-column: 1 / -1; }
#chart-mac:checked ~ .chart-panel-mac, #chart-linux:checked ~ .chart-panel-linux { display: block; }
.chart-panel { margin-top: 22px; }
.chart-axis-title { display: flex; justify-content: space-between; font-size: var(--chart-label-font-size); font-weight: 400; margin: 0 0 12px; }
.chart-axis-title span { color: var(--chart-muted); font-weight: 400; }
.chart-faster { display: inline-flex; align-items: center; gap: .25em; }
.chart-up-arrow { display: inline-block; line-height: 1; transform: translateY(-.12em); }
.chart-frame { display: grid; grid-template-columns: var(--chart-axis-width) minmax(0, 1fr); height: var(--chart-height); }
.chart-y-axis { position: relative; color: var(--chart-muted); font-size: 11px; }
.chart-y-axis span { position: absolute; right: 9px; transform: translateY(50%); }
.chart-plot { position: relative; height: 100%; }
.chart-grid { position: absolute; inset: 0; pointer-events: none; }
.chart-grid span { position: absolute; width: 100%; border-top: 1px solid var(--chart-grid); }
.chart-grid span:first-child { border-color: var(--chart-border); }
.chart-groups { position: relative; height: 100%; display: grid; grid-template-columns: repeat(12, minmax(0, 1fr)); column-gap: 8px; padding: 0 5px; }
.chart-level { height: 100%; min-width: 0; position: relative; }
.chart-pair { height: 100%; display: flex; align-items: flex-end; justify-content: center; gap: 3px; }
.chart-bar { width: 50%; max-width: 18px; display: flex; flex-direction: column-reverse; border-radius: 3px 3px 0 0; position: relative; }
.chart-bar > span { display: block; width: 100%; flex: 0 0 auto; }
.chart-bar > .chart-high { border-radius: 3px 3px 0 0; }
.chart-bar:hover, .chart-bar:focus-visible { outline: 2px solid var(--heading-color); outline-offset: -2px; }
.chart-bar-roc .chart-low, .legend-roc-low { background: var(--roc-low); }
.chart-bar-roc .chart-high, .legend-roc-high { background: var(--roc-high); }
.chart-bar-libdeflate .chart-low, .legend-c-low { background: var(--c-low); }
.chart-bar-libdeflate .chart-high, .legend-c-high { background: var(--c-high); }
.chart-level-label { position: absolute; top: calc(100% + 8px); left: 50%; transform: translateX(-50%); font-size: 12px; color: var(--chart-muted); }
.compression-chart .chart-x-axis { margin: 52px 0 8px var(--chart-axis-width); text-align: center; font-size: var(--chart-label-font-size); font-weight: 400; }
.chart-legend { position: absolute; top: 0; right: 0; display: grid; grid-template-rows: repeat(4, 1fr); justify-items: end; align-items: center; font-size: var(--chart-label-font-size); }
.chart-legend > span { display: flex; gap: 6px; align-items: center; justify-content: flex-end; text-align: right; white-space: nowrap; }
.chart-legend i { display: inline-block; width: 11px; height: 11px; border-radius: 2px; flex-shrink: 0; }
@media (prefers-color-scheme: dark) {
    .compression-chart { --chart-surface: #1e1c23; --chart-border: #49434f; --chart-grid: #39353e; --chart-muted: #bbb4c7; --roc-low: #cfb5f5; --roc-high: #8245ce; --c-low: #c4c4ce; --c-high: #696974; }
}
@media (max-width: 540px) {
    .compression-chart { --chart-height: 560px; --chart-axis-width: 31px; --chart-label-font-size: 12px; display: block; padding: 18px 12px 14px; border-radius: 10px; }
    .compression-chart figcaption { margin-bottom: 18px; }
    .chart-controls { width: 100%; }
    .chart-controls label { flex: 1; padding: 7px 6px; font-size: 12px; }
    .chart-groups { column-gap: 4px; padding: 0 2px; }
    .chart-pair { gap: 2px; }
    .chart-level-label { font-size: clamp(9px, 2.5vw, 10px); }
    .compression-chart .chart-x-axis { margin-top: 44px; }
    .chart-legend { max-width: 50%; }
    .chart-legend > span { max-width: 100%; white-space: normal; line-height: 1.1; }
}
@media print {
    .compression-chart { break-inside: avoid; print-color-adjust: exact; }
    .chart-controls, .chart-radio { display: none; }
    .chart-panel { display: block; }
    .chart-panel::before { display: block; font-weight: bold; margin-top: 16px; }
    .chart-panel-mac::before { content: "M1 MacBook Pro"; }
    .chart-panel-linux::before { content: "Ryzen 3900X Ubuntu"; }
}
</style>
<!-- END COMPRESSION CHART STYLE -->
CSS

my $page = slurp($article);
if ($page =~ /<!-- BEGIN COMPRESSION CHART -->/) {
    $page =~ s/<!-- BEGIN COMPRESSION CHART -->.*?<!-- END COMPRESSION CHART -->\n?/$html/s or die "Chart markers are incomplete\n";
} else {
    $page =~ s{<p>\[graph goes here\]</p>}{$html} or die "No chart placeholder in $article\n";
}
if ($page =~ /<!-- BEGIN COMPRESSION CHART STYLE -->/) {
    $page =~ s/<!-- BEGIN COMPRESSION CHART STYLE -->.*?<!-- END COMPRESSION CHART STYLE -->\n?/$css/s or die "Style markers are incomplete\n";
} else {
    $page =~ s{(\s*</head>)}{\n$css$1} or die "No head in $article\n";
}
die "Unexpected JavaScript in article\n" if $page =~ /<script\b|\bon\w+\s*=|javascript\s*:/i;
open my $out, '>:encoding(UTF-8)', $article or die "$article: $!\n";
print {$out} $page;
close $out or die "$article: $!\n";
print "Updated $article (shared axis: 0–$axis_max MB/s)\n";

sub escape_html {
    my ($s) = @_;
    $s =~ s/&/&amp;/g; $s =~ s/</&lt;/g; $s =~ s/>/&gt;/g; $s =~ s/"/&quot;/g;
    return $s;
}
sub slurp {
    my ($path) = @_;
    open my $fh, '<:encoding(UTF-8)', $path or die "$path: $!\n";
    local $/;
    return <$fh>;
}
sub read_csv {
    my ($path) = @_;
    # Parse CSV quoted fields, doubled quotes, CRLF, and embedded newlines.
    my $text = slurp($path);
    my (@records, @fields);
    pos($text) = 0;
    while (pos($text) < length($text)) {
        $text =~ /\G(?:"((?:[^"]|"")*)"|([^",\r\n]*))(,|\r\n|\n|\r|\z)/gc
            or die "Malformed CSV in $path at byte " . (pos($text) // 0) . "\n";
        my ($quoted, $plain, $separator) = ($1, $2, $3);
        my $value = defined($quoted) ? $quoted : $plain;
        $value =~ s/""/"/g if defined($quoted);
        push @fields, $value;
        if ($separator ne ',') { push @records, [@fields]; @fields = (); }
    }
    die "Incomplete CSV record in $path\n" if @fields;
    my $header = shift @records or die "Empty CSV: $path\n";
    my @rows;
    for my $values (@records) {
        die "CSV column count mismatch in $path\n" unless @$header == @$values;
        my %row;
        @row{@$header} = @$values;
        push @rows, \%row;
    }
    return \@rows;
}
