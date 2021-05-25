//------------------------------------------------------------------------------
// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT License.
//------------------------------------------------------------------------------

using System;
using System.Diagnostics;
using System.Resources;

namespace Microsoft.CodeTalk.LanguageService
{
    public class Block : AbstractSyntaxEntity
    {
        protected Block(string name, FileSpan location, ISyntaxEntity parent, CodeFile currentCodeFile) 
            : base(name, location, parent, currentCodeFile)
        {
            
        }

        public override SyntaxEntityKind Kind
        {
            get
            {
                return SyntaxEntityKind.Block;
            }
        }

        public override void AcceptVisitor(ICodeVisitor visitor)
        {
            visitor?.VisitBlock(this);
        }

        public override string SpokenText()
        {
			return $"{this.Kind} at line {this.Location.StartLineNumber}";
		}

        public override string DisplayText()
        {
			return $"{this.Kind} at line {this.Location.StartLineNumber}";
		}
    }
}