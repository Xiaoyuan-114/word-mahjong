import type { Mode } from '@shared/types';
import { MODE_LABELS } from '../labels';

interface RulesOverlayProps {
  mode: Mode;
  onClose: () => void;
}

export function RulesOverlay({ mode, onClose }: RulesOverlayProps) {
  return (
    <div className="overlay rules-overlay" role="dialog" aria-modal="true" aria-labelledby="rules-title">
      <div className="overlay-backdrop" onClick={onClose} />
      <section className="modal-card">
        <header className="modal-head">
          <div>
            <p className="eyebrow">规则速查</p>
            <h2 id="rules-title">{MODE_LABELS[mode]}</h2>
          </div>
          <button type="button" className="btn btn--ghost btn--sm" onClick={onClose}>
            关闭
          </button>
        </header>

        {mode === 'pin-ci' ? (
          <ol className="rules-list rules-list--compact">
            <li>
              <strong>起手 13 张，摸到 14 张</strong>
              <span>轮到你时自动摸牌，然后弃一张或宣布胡。</span>
            </li>
            <li>
              <strong>下家可以抢字</strong>
              <span>抢到后手牌变 14 张，必须马上弃一张；本回合不能胡。</span>
            </li>
            <li>
              <strong>胡牌要用完全部手牌</strong>
              <span>把手牌按顺序排好，可插入分隔符分成多段，然后提交给其他玩家表决。</span>
            </li>
            <li>
              <strong>票数不够就继续</strong>
              <span>被否决后必须弃一张；牌墙摸空则流局。</span>
            </li>
          </ol>
        ) : (
          <ol className="rules-list rules-list--compact">
            <li>
              <strong>起手 14 张，摸到 15 张</strong>
              <span>轮到你时自动摸牌，再打出一句 2–5 张的短句，或选择过。</span>
            </li>
            <li>
              <strong>短句由其他玩家表决</strong>
              <span>超过半数认可后，这些牌才会离开手牌。</span>
            </li>
            <li>
              <strong>手牌先到 3 张以内获胜</strong>
              <span>被否决的短句不会扣牌；牌墙摸空则手牌最少者获胜。</span>
            </li>
          </ol>
        )}

        <div className="rules-vote-table">
          <h3>投票门槛</h3>
          <table>
            <thead>
              <tr>
                <th>人数</th>
                <th>其他玩家</th>
                <th>需要认可</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td>2 人</td>
                <td>1</td>
                <td>1 / 1</td>
              </tr>
              <tr>
                <td>3 人</td>
                <td>2</td>
                <td>2 / 2（都要认可）</td>
              </tr>
              <tr>
                <td>4 人</td>
                <td>3</td>
                <td>2 / 3</td>
              </tr>
            </tbody>
          </table>
        </div>

        <p className="fine-print">
          投票 20 秒，超时未投视为不认可；抢字窗口 5 秒；回合时限 90 秒，超时会自动弃牌或过。
        </p>
      </section>
    </div>
  );
}
